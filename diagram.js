/* Compact, local-only views of the current inheritance-plan state. No secrets are collected. */
(function(){
  var viewMode = 'overview';
  function tr(de,en){ return LANG==='de'?de:en; }
  function diagramTitle(){ return tr('ClavaStack-Bitcoin-Sicherheitsübersicht','ClavaStack Bitcoin Security Overview'); }
  function safe(v){ return esc(v==null?'':v); }
  function label(v,fallback){ return String(v||fallback); }
  function node(id,kind,title,lines,layer,icon,symbol){ return {id:id,kind:kind,title:title,lines:(lines||[]).filter(Boolean),layer:layer,icon:icon||'',symbol:symbol||''}; }
  function detail(key,value){ return value===undefined || value===null || value==='' ? '' : key+': '+value; }
  function fmtWallet(w){
    if(!w) return [];
    var out=[];
    if(w.fp) out.push(detail('FP',w.fp));
    if(w.derivPath) out.push(detail('Path',w.derivPath));
    if(w.xpub) out.push(tr('xPub vorhanden','xPub present'));
    var fmts=w.fmts||[];
    if(fmts.length) out.push(detail(tr('Format','Format'),fmts.map(function(i){return ADDR_TYPES[i]||'';}).filter(Boolean).join(', ')));
    var count=0; for(var i=0;i<fmts.length;i++) count+=(w.acc&&w.acc[fmts[i]])||1;
    if(count) out.push(detail(tr('Konten','Accounts'),count));
    for(var f=0;f<fmts.length;f++){
      var purposes=(w.pur&&w.pur[fmts[f]])||[];
      for(var a=0;a<purposes.length;a++) if(purposes[a]) out.push(detail(tr('Konto ','Account ')+(a+1),purposes[a]));
    }
    return out;
  }
  function backupTitle(b,i){
    var type=backupTypeLabel(b.type)||tr('Backup','Backup');
    var brand=b.type==='metal'?backupBrandName(b):'';
    return tr('Backup ','Backup ')+(i+1)+' · '+type+(brand?' · '+brand:'');
  }
  function backupIcon(b){
    if(!b) return '';
    if(b.type==='paper_rip') return 'assets/diagram/backup-paper-rip.png';
    if(b.type==='paper') return b.bagDigital?'assets/diagram/backup-tamper-evident-bag.png':'assets/diagram/backup-paper.png';
    if(b.type==='metal') return 'assets/diagram/backup-metal.png';
    if(b.type==='smartcard') return 'assets/diagram/smartcard.png';
    return '';
  }
  function timelockBrief(rec){
    var units={blocks:tr('Blöcke','blocks'),days:tr('Tage','days'),months:tr('Monate','months'),years:tr('Jahre','years')};
    var raw=(rec.timelockValue||'')+' '+(units[rec.timelockUnit]||'');
    var blocks=lwTimelockBlocks(rec);
    return rec.timelockUnit==='blocks'?raw:raw+' (~'+blocks+' '+tr('Blöcke','blocks')+')';
  }
  function model(){
    var nodes=[],edges=[],ids={};
    function add(n){ if(!ids[n.id]){ nodes.push(n); ids[n.id]=n; } return n.id; }
    function edge(from,to,text){ if(ids[from]&&ids[to]) edges.push({from:from,to:to,text:text||''}); }
    var i,j,k,s,b,d,ms,lw;
    for(i=0;i<state.seeds.length;i++){
      s=state.seeds[i];
      var sLines=fmtWallet(s.wallet);
      sLines.unshift(tr('Seedphrase','Seed phrase'));
      if(s.passphrases) sLines.push(detail(tr('Passphrasen','Passphrases'),s.passphrases));
      add(node('seed-'+i,'seed',label(s.name,tr('Seed ','Seed ')+(i+1)),sLines,0,'assets/diagram/seed.png'));
    }
    for(i=0;i<state.seeds.length;i++){
      s=state.seeds[i];
      for(j=0;j<(s.backups||[]).length;j++){
        b=s.backups[j];
        var bLines=[];
        if(b.bagNo) bLines.push(detail(tr('Siegel','Seal'),b.bagNo));
        if(b.smartcard) bLines.push(detail('Smartcard',b.smartcard));
        add(node('backup-'+i+'-'+j,'backup',backupTitle(b,j),bLines,1,b.type==='sd'?'assets/products/sd-card.png':backupIcon(b)));
        edge('seed-'+i,'backup-'+i+'-'+j,tr('Backup','Backup'));
      }
      for(j=0;j<(s.devices||[]).length;j++){
        d=s.devices[j]; if(!state.devices[d]) continue;
        var dv=state.devices[d],dl=[detail(tr('Gerät','Device'),pdfDeviceModelName(dv))];
        if(dv.smartcards) dl.push(detail('Smartcards',(dv.smartcardNames||[]).filter(Boolean).join(', ')||dv.smartcards));
        var apps=(dv.companions||[]).map(companionAppName).filter(Boolean);
        if(apps.length) dl.push(detail('Apps',apps.join(', ')));
        var deviceCatalog=getModel(dv.model);
        add(node('device-'+d,'device',label(pdfDeviceModelName(dv),tr('Gerät ','Device ')+(d+1)),dl.slice(1),1,deviceCatalog&&deviceCatalog.img));
        edge('seed-'+i,'device-'+d,tr('auf Gerät','on device'));
      }
      for(j=0;j<(s.pp||[]).length;j++){
        add(node('pass-'+i+'-'+j,'wallet',tr('Passphrase ','Passphrase ')+(j+1),fmtWallet(s.pp[j]),1,'','password'));
        edge('seed-'+i,'pass-'+i+'-'+j,'+ Passphrase');
      }
    }
    for(i=0;i<state.devices.length;i++){
      if(!ids['device-'+i]){
        d=state.devices[i];
        var standaloneCatalog=getModel(d.model);
        add(node('device-'+i,'device',label(pdfDeviceModelName(d),tr('Gerät ','Device ')+(i+1)),[(d.smartcards?detail('Smartcards',(d.smartcardNames||[]).filter(Boolean).join(', ')||d.smartcards):'')].concat((d.companions||[]).map(function(c){return detail('App',companionAppName(c));})),1,standaloneCatalog&&standaloneCatalog.img));
      }
    }
    ['pc','phone'].forEach(function(kind){
      var num=state.sw[kind]||0;
      for(var x=0;x<num;x++){
        var meta=swMeta(kind,x),catalog=getSwWallet((state.sw[kind+'Models']||[])[x]||'');
        var name=label(swModelName(kind,x),(kind==='pc'?tr('Computer-Wallet ','Computer wallet '):tr('Handy-Wallet ','Phone wallet '))+(x+1));
        var isCustodial=(catalog&&catalog.custodial)||(catalog&&catalog.dualMode&&meta.mode==='custodial');
        var lines=[kind==='pc'?'PC':tr('Handy','Phone')];
        if(isCustodial) lines.push('Custodial');
        else if(catalog&&catalog.noSeed) lines.push(tr('Ohne Seed','No seed'));
        else lines.push('Self-custody');
        if(meta.recoveryValue&&isCustodial) lines.push(detail(tr('Konto','Account'),meta.recoveryValue));
        add(node('sw-'+kind+'-'+x,'software',name,lines,2,catalog&&catalog.img));
        if(state.bip85 && meta.b85 && !isCustodial){
          var source=String(meta.seed),parts=[detail('BIP85 Index',meta.idx),detail(tr('Wörter','Words'),meta.words)];
          add(node('derived-'+kind+'-'+x,'derived',tr('Abgeleiteter Seed','Derived seed'),parts,1));
          if(/^\d+$/.test(source) && state.seeds[Number(source)]) edge('seed-'+Number(source),'derived-'+kind+'-'+x,'BIP85');
          edge('derived-'+kind+'-'+x,'sw-'+kind+'-'+x,tr('verwendet in','used by'));
        }
      }
    });
    for(i=0;i<state.multisigs.length;i++){
      ms=state.multisigs[i];
      var msLines=[tr('Multi-Signatur','Multisignature'),(ms.m||'?')+' / '+(ms.n||'?'),detail('App',ms.companion||'')];
      if(ms.descriptor) msLines.push(tr('Descriptor vorhanden','Descriptor present'));
      var msApp=getCompanion(ms.companion);
      add(node('ms-'+i,'multisig',label(ms.name,'Multisig '+(i+1)),msLines,2,msApp&&msApp.img));
      (ms.seeds||[]).forEach(function(si){edge('seed-'+si,'ms-'+i,tr('Schlüssel','key'));});
      (ms.hot||[]).forEach(function(hid){edge('sw-'+hid,'ms-'+i,tr('Schlüssel','key'));});
      (ms.cosigners||[]).forEach(function(c,ci){
        var cosModel=getModel(c.hwModel);
        add(node('cos-ms-'+i+'-'+ci,'cosigner',label(c.name,tr('Cosigner ','Cosigner ')+(ci+1)),[c.hwModel||''],1,cosModel&&cosModel.img));
        edge('cos-ms-'+i+'-'+ci,'ms-'+i,tr('Schlüssel','key'));
      });
      if(ms.descriptor || (ms.dbDevices||[]).length || (ms.dbBackups||[]).length || ms.dbPwm || ms.dbBook){
        var stores=[];
        if((ms.dbDevices||[]).length) stores.push(detail(tr('Gerät','Device'),ms.dbDevices.map(function(di){return state.devices[di]?pdfDeviceModelName(state.devices[di]):'';}).filter(Boolean).join(', ')));
        if((ms.dbBackups||[]).length) stores.push(detail('Backup',ms.dbBackups.map(function(ref){var bits=String(ref).split(':');return state.seeds[Number(bits[0])]?seedName(Number(bits[0]))+' #'+(Number(bits[1])+1):'';}).filter(Boolean).join(', ')));
        if(ms.dbPwm) stores.push(tr('Passwortmanager','Password manager'));
        if(ms.dbBook) stores.push(tr('Passwortbuch','Password book'));
        add(node('desc-ms-'+i,'descriptor','Descriptor',stores,3));
        edge('ms-'+i,'desc-ms-'+i,'Descriptor');
      }
    }
    if(anyLianaCompanion()) for(i=0;i<state.lianaWallets.length;i++){
      lw=state.lianaWallets[i];
      var rec=(lw.recoveries||[]).map(function(r,ri){return tr('Recovery ','Recovery ')+(ri+1)+' · '+(r.m||1)+'/'+(r.n||1)+' · '+timelockBrief(r);});
      var lwLines=[detail(tr('Primär','Primary'),(lw.primary.m||1)+'/'+(lw.primary.n||1))].concat(rec);
      if(lw.descriptor) lwLines.push(tr('Descriptor vorhanden','Descriptor present'));
      add(node('liana-'+i,'liana',label(lw.name,tr('Vererbungs-Wallet ','Inheritance wallet ')+(i+1)),lwLines,2,LIANA_LOGO_URL));
      var paths=[lw.primary].concat(lw.recoveries||[]);
      paths.forEach(function(p,pi){
        (p.seeds||[]).forEach(function(si){edge('seed-'+si,'liana-'+i,pi===0?tr('Primär','Primary'):tr('Recovery','Recovery'));});
        (p.hot||[]).forEach(function(hid){edge('sw-'+String(hid),'liana-'+i,pi===0?tr('Primär','Primary'):tr('Recovery','Recovery'));});
        (p.cosigners||[]).forEach(function(c,ci){
          var cid='cos-liana-'+i+'-'+pi+'-'+ci;
          var lianaCosModel=getModel(c.hwModel);
          add(node(cid,'cosigner',label(c.name,tr('Cosigner ','Cosigner ')+(ci+1)),[c.hwModel||''],1,lianaCosModel&&lianaCosModel.img));
          edge(cid,'liana-'+i,pi===0?tr('Primär','Primary'):tr('Recovery','Recovery'));
        });
      });
      if(lw.descriptor || (lw.dbDevices||[]).length || (lw.dbBackups||[]).length || lw.dbPwm || lw.dbBook || lw.dbLianaApp){
        var ls=[];
        if((lw.dbDevices||[]).length) ls.push(detail(tr('Gerät','Device'),lw.dbDevices.map(function(di){return state.devices[di]?pdfDeviceModelName(state.devices[di]):'';}).filter(Boolean).join(', ')));
        if((lw.dbBackups||[]).length) ls.push(detail('Backup',lw.dbBackups.map(function(ref){var bits=String(ref).split(':');return state.seeds[Number(bits[0])]?seedName(Number(bits[0]))+' #'+(Number(bits[1])+1):'';}).filter(Boolean).join(', ')));
        if(lw.dbPwm) ls.push(tr('Passwortmanager','Password manager'));
        if(lw.dbBook) ls.push(tr('Passwortbuch','Password book'));
        if(lw.dbLianaApp) ls.push('Liana App');
        add(node('desc-liana-'+i,'descriptor','Descriptor',ls,3));
        edge('liana-'+i,'desc-liana-'+i,'Descriptor');
      }
    }
    for(i=0;i<state.ex.count;i++){
      var tf=(state.ex.twofa||[])[i]||[];
      var exLines=tf.length?[detail('2FA',tf.join(', '))]:[];
      var en=exDisplayName(i);
      var ex=exchangeAt(i);
      if(ex) exLines.unshift(ex.custodial?'Custodial':(ex.hasSeed?'Self-custody':''));
      if(tf.indexOf('hw')>=0 && (state.ex.twofaHwModel||[])[i]) exLines.push(detail(tr('Sicherheitsschlüssel','Security key'),state.ex.twofaHwModel[i]));
      if(tf.indexOf('sms')>=0 && (state.ex.twofaSmsNumber||[])[i]) exLines.push(detail('SMS',state.ex.twofaSmsNumber[i]));
      if(tf.indexOf('email')>=0 && (state.ex.twofaEmailAddr||[])[i]) exLines.push(detail(tr('E-Mail','Email'),state.ex.twofaEmailAddr[i]));
      add(node('exchange-'+i,'exchange',label(en,tr('Börse ','Exchange ')+(i+1)),exLines,3,ex&&ex.img));
    }
    if(state.pwm.use===true){
      var pwmCatalog=PASSWORD_MANAGERS.filter(function(item){return item.label===state.pwm.app;})[0];
      add(node('pwm','storage',label(pwmDisplayName(),tr('Passwortmanager','Password manager')),[],3,pwmCatalog&&pwmCatalog.img));
    }
    if(state.book.use===true) add(node('book','storage',tr('Passwortbuch','Password book'),[],3));
    if(state.dig.use===true){
      var digitalTitle=state.dig.enc?tr('Verschlüsseltes Digital-Backup','Encrypted digital backup'):tr('Digitales Backup','Digital backup');
      add(node('digital','storage',digitalTitle,state.dig.enc?[]:[tr('Nicht verschlüsselt','Unencrypted')],3));
    }
    if(state.timelock.use){
      var tl=state.timelock,tlLines=[];
      if(tl.fromW) tlLines.push(detail(tr('Von','From'),tl.fromW));
      if(tl.toW) tlLines.push(detail(tr('Nach','To'),tl.toW==='__custom__'?tl.toCustom:tl.toW));
      if(tl.ritrek) tlLines.push('RITREK');
      add(node('timelock','timelock','Timelock Recovery',tlLines,3,TIMELOCK_LOGO_URL));
    }
    for(i=0;i<state.contacts.length;i++){
      var ct=state.contacts[i];
      if(ct.info || ct.note) add(node('contact-'+i,'contact',label(ct.info,tr('Kontakt ','Contact ')+(i+1)),[ct.note||''],0));
    }
    return {nodes:nodes,edges:edges,byId:ids};
  }
  function glyph(kind){ return ({seed:'◇',backup:'▤',device:'▣',wallet:'◈',derived:'↳',software:'▦',multisig:'⬡',liana:'⌛',cosigner:'◎',descriptor:'≡',exchange:'₿',storage:'▥',timelock:'⏱',contact:'◉'})[kind]||'◇'; }
  function symbolName(n){
    if(n.symbol) return n.symbol;
    if(n.id==='pwm') return 'password';
    if(n.id==='digital') return 'cloud';
    if(n.id==='book') return 'file';
    return ({seed:'mnemonic',backup:'safe',device:'devices',wallet:'wallet',derived:'tree-structure',software:'wallet',multisig:'shared-wallet',liana:'clock',cosigner:'two-keys',descriptor:'file',exchange:'exchange',storage:'safe',timelock:'clock',contact:'contacts'})[n.kind]||'wallet';
  }
  function symbolHtml(name){ var src='assets/bitcoin-icons/'+name+'.svg'; return '<span class="dg-symbol" data-src="'+src+'" style="--dg-symbol:url(\''+src+'\')" aria-hidden="true"></span>'; }
  function nodeHtml(n){
    var icon='<span class="dg-icon'+(n.icon?'':' dg-generic')+'" aria-hidden="true">'+(n.icon?'<img src="'+safe(n.icon)+'" alt="" onload="this.parentNode.classList.add(\'has-image\')" onerror="this.style.display=\'none\'">':symbolHtml(symbolName(n)))+'<span class="dg-glyph">'+glyph(n.kind)+'</span></span>';
    return '<div class="dg-node dg-'+n.kind+(n.icon?' dg-branded':'')+'"><div class="dg-node-head">'+icon+'<strong>'+safe(n.title)+'</strong></div>'+
      (n.lines.length?'<ul>'+n.lines.map(function(v){return '<li title="'+safe(v)+'">'+safe(v)+'</li>';}).join('')+'</ul>':'')+'</div>';
  }
  var SEED_COLORS=['#2f9bcb','#dd8730','#aa78d7','#51b878','#df7181','#2eadaa','#c172bd','#b9a139'];
  function seedColor(i){ return SEED_COLORS[i%SEED_COLORS.length]; }
  function seedLineage(g){
    var belongs={};
    g.nodes.forEach(function(n){belongs[n.id]=[];});
    for(var i=0;i<state.seeds.length;i++) if(belongs['seed-'+i]) belongs['seed-'+i]=[i];
    for(var pass=0;pass<g.nodes.length;pass++){
      var changed=false;
      g.edges.forEach(function(e){
        if(!belongs[e.from]||!belongs[e.to]) return;
        belongs[e.from].forEach(function(si){if(belongs[e.to].indexOf(si)<0){belongs[e.to].push(si);changed=true;}});
      });
      if(!changed) break;
    }
    Object.keys(belongs).forEach(function(id){belongs[id].sort(function(a,b){return a-b;});});
    return belongs;
  }
  function seedStripe(ids){
    var stops=[];
    ids.forEach(function(si,i){var start=100*i/ids.length,end=100*(i+1)/ids.length;stops.push(seedColor(si)+' '+start+'%',seedColor(si)+' '+end+'%');});
    return 'linear-gradient(to bottom,'+stops.join(',')+')';
  }
  function overviewNodeHeight(n){
    var lines=n.lines||[],lineHeight=22;
    var content=lines.reduce(function(total,line){return total+Math.max(1,Math.ceil(String(line).length/28))*lineHeight;},0);
    return 70+content;
  }
  function overview(g,printLayout){
    if(!g.nodes.length) return '<div class="dg-empty">'+tr('Noch keine Angaben im Plan.','No plan details yet.')+'</div>';
    var belongs=seedLineage(g);
    var upperEdges=g.edges.filter(function(e){return g.byId[e.from] && g.byId[e.to] && g.byId[e.to].layer>g.byId[e.from].layer+1;});
    var topPad=Math.max(80,38+upperEdges.length*14);
    var positions={},layerY=[topPad,topPad,topPad,topPad],maxY=0,width=1370,columns=[20,350,730,1110];
    var rank={derived:0,device:1,backup:2,wallet:3,cosigner:4,software:0,multisig:1,liana:2};
    g.nodes.slice().sort(function(a,b){
      if(a.layer!==b.layer) return a.layer-b.layer;
      if(a.layer===1){
        var aIds=belongs[a.id]||[],bIds=belongs[b.id]||[];
        var aGroup=aIds.length===1?aIds[0]:99,bGroup=bIds.length===1?bIds[0]:99;
        if(aGroup!==bGroup) return aGroup-bGroup;
      }
      return (rank[a.kind]===undefined?5:rank[a.kind])-(rank[b.kind]===undefined?5:rank[b.kind]);
    }).forEach(function(n){
      if(n.layer===1 && n.kind==='cosigner') return;
      var h=overviewNodeHeight(n);
      var layer=Math.max(0,Math.min(3,n.layer));
      positions[n.id]={x:columns[layer],y:layerY[layer],w:240,h:h,layer:layer};
      layerY[layer]+=h+44;
    });
    g.nodes.filter(function(n){return n.layer===1 && n.kind==='cosigner';}).sort(function(a,b){
      function targetY(n){var e=g.edges.filter(function(edge){return edge.from===n.id && positions[edge.to];})[0];return e?positions[e.to].y:topPad;}
      return targetY(a)-targetY(b);
    }).forEach(function(n){
      var h=overviewNodeHeight(n);
      var e=g.edges.filter(function(edge){return edge.from===n.id && positions[edge.to];})[0];
      var desired=e?positions[e.to].y+positions[e.to].h/2:topPad;
      var peers=Object.keys(positions).map(function(id){return positions[id];}).filter(function(p){return p.layer===1;}).sort(function(a,b){return a.y-b.y;});
      var next=peers.filter(function(p){return p.y+p.h>=desired;})[0];
      var y=next?next.y:peers.length?peers[peers.length-1].y+peers[peers.length-1].h+44:topPad;
      peers.forEach(function(p){if(p.y>=y) p.y+=h+44;});
      positions[n.id]={x:columns[1],y:y,w:240,h:h,layer:1};
    });
    var seedCursor=topPad;
    g.nodes.filter(function(n){return n.kind==='seed';}).forEach(function(n){
      var p=positions[n.id],targets=g.edges.filter(function(e){return e.from===n.id && positions[e.to] && positions[e.to].layer===1;});
      var first=targets.length?Math.min.apply(null,targets.map(function(e){return positions[e.to].y;})):seedCursor;
      p.y=Math.max(seedCursor,first);seedCursor=p.y+p.h+44;
    });
    g.nodes.filter(function(n){return n.layer===0 && n.kind!=='seed';}).forEach(function(n){var p=positions[n.id];p.y=seedCursor;seedCursor+=p.h+44;});
    var rightCursor=topPad;
    g.nodes.filter(function(n){return n.layer===3 && n.kind==='descriptor';}).forEach(function(n){
      var p=positions[n.id],incoming=g.edges.filter(function(e){return e.to===n.id && positions[e.from];});
      var desired=incoming.length?positions[incoming[0].from].y:rightCursor;
      p.y=Math.max(rightCursor,desired);rightCursor=p.y+p.h+44;
    });
    g.nodes.filter(function(n){return n.layer===3 && n.kind!=='descriptor';}).forEach(function(n){var p=positions[n.id];p.y=rightCursor;rightCursor+=p.h+44;});
    if(printLayout){
      // The print sheets show 810 diagram pixels on page one and 930 thereafter.
      // Keep every node clear of those exact clipping boundaries.
      for(var cut=810;cut<20000;cut+=930){
        var all=Object.keys(positions).map(function(id){return positions[id];});
        var last=Math.max.apply(null,all.map(function(p){return p.y+p.h;}));
        if(last<cut-40) break;
        var near=all.filter(function(p){return p.y<cut+65 && p.y+p.h>cut-40;}).sort(function(a,b){return a.y-b.y;});
        if(!near.length) continue;
        var start=near[0].y,shift=cut+100-start;
        all.forEach(function(p){if(p.y>=start) p.y+=shift;});
      }
    }
    Object.keys(positions).forEach(function(id){var p=positions[id];maxY=Math.max(maxY,p.y+p.h+24);});
    function elbow(sx,sy,rail,tx,ty,reverse){
      if(Math.abs(ty-sy)<4) return 'M'+sx+' '+sy+' H'+tx;
      var dir=ty>sy?1:-1,r=8,exit=rail-r,entry=reverse?rail-r:rail+r;
      return 'M'+sx+' '+sy+' H'+exit+' Q'+rail+' '+sy+' '+rail+' '+(sy+dir*r)+' V'+(ty-dir*r)+' Q'+rail+' '+ty+' '+entry+' '+ty+' H'+tx;
    }
    var paths=g.edges.map(function(e){
      var a=positions[e.from],b=positions[e.to]; if(!a||!b) return '';
      var ids=belongs[e.from]||[],color=ids.length===1?seedColor(ids[0]):'#90a6b5',marker=ids.length===1?'dg-arrow-'+ids[0]:'dg-arrow-neutral';
      var incoming=g.edges.filter(function(other){return other.to===e.to && positions[other.from];}).sort(function(left,right){
        var lp=positions[left.from],rp=positions[right.from];
        return lp.y+lp.h/2-rp.y-rp.h/2;
      });
      var port=incoming.indexOf(e);
      var outgoing=g.edges.filter(function(other){return other.from===e.from && positions[other.to];}).sort(function(left,right){
        var lp=positions[left.to],rp=positions[right.to];
        return lp.y+lp.h/2-rp.y-rp.h/2;
      });
      var sourcePort=outgoing.indexOf(e),upperLane=upperEdges.indexOf(e);
      var sx=a.x+a.w,sy=a.y+a.h*(sourcePort+1)/(outgoing.length+1),tx=b.x-8,ty=b.y+b.h*(port+1)/(incoming.length+1),path,route;
      if(b.layer===a.layer){
        var returnRail=sx+24+(sourcePort%7)*7;
        path=elbow(sx,sy,returnRail,b.x+b.w+8,ty,true);route='return';
      } else if(b.layer===a.layer+1){
        var gapRail=sx+20+(sourcePort%7)*7;
        path=elbow(sx,sy,gapRail,tx,ty,false);route='gutter';
      } else {
        var busY=22+upperLane*14,leftRail=sx+18+(upperLane%8)*7,rightRail=b.x-70+(upperLane%8)*7;
        path='M'+sx+' '+sy+' H'+(leftRail-8)+' Q'+leftRail+' '+sy+' '+leftRail+' '+(sy-8)+' V'+(busY+8)+' Q'+leftRail+' '+busY+' '+(leftRail+8)+' '+busY+
          ' H'+(rightRail-8)+' Q'+rightRail+' '+busY+' '+rightRail+' '+(busY+8)+' V'+(ty-8)+' Q'+rightRail+' '+ty+' '+(rightRail+8)+' '+ty+' H'+tx;
        route='upper-bus';
      }
      return '<path d="'+path+'" style="--dg-edge-color:'+color+'" data-from="'+safe(e.from)+'" data-to="'+safe(e.to)+'" data-seeds="'+ids.join(',')+'" data-route="'+route+'" marker-end="url(#'+marker+')"><title>'+safe(g.byId[e.from].title)+' → '+safe(g.byId[e.to].title)+(e.text?' · '+safe(e.text):'')+'</title></path>';
    }).join('');
    var cards=g.nodes.map(function(n){
      var p=positions[n.id],ids=belongs[n.id]||[],extra=ids.length===1?'--dg-accent:'+seedColor(ids[0]):ids.length>1?'--dg-stripe:'+seedStripe(ids):'';
      return {id:n.id,html:'<div class="dg-position'+(ids.length===1?' dg-seed-linked':ids.length>1?' dg-seed-mixed':'')+'" data-node="'+safe(n.id)+'" data-seeds="'+ids.join(',')+'" style="left:'+p.x+'px;top:'+p.y+'px;width:'+p.w+'px;min-height:'+p.h+'px;'+extra+'">'+nodeHtml(n)+'</div>'};
    });
    var markers=SEED_COLORS.map(function(color,i){return '<marker id="dg-arrow-'+i+'" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" style="--dg-marker-color:'+color+'"/></marker>';}).join('');
    markers+='<marker id="dg-arrow-neutral" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" style="--dg-marker-color:#90a6b5"/></marker>';
    var dots=g.edges.map(function(e){
      if(!positions[e.from]) return '';
      var p=positions[e.from],ids=belongs[e.from]||[],color=ids.length===1?seedColor(ids[0]):'#90a6b5';
      var outgoing=g.edges.filter(function(other){return other.from===e.from && positions[other.to];}).sort(function(left,right){
        var lp=positions[left.to],rp=positions[right.to];
        return lp.y+lp.h/2-rp.y-rp.h/2;
      });
      return '<circle cx="'+(p.x+p.w)+'" cy="'+(p.y+p.h*(outgoing.indexOf(e)+1)/(outgoing.length+1))+'" r="3" style="--dg-dot-color:'+color+'"/>';
    }).join('');
    var key=g.nodes.filter(function(n){return n.kind==='seed';}).map(function(n){var si=Number(n.id.slice(5));return '<span><i style="background:'+seedColor(si)+'"></i>'+safe(n.title)+'</span>';}).join('');
    if(printLayout){
      var legendItems=[['seed','Seed'],['derived','BIP85'],['device',tr('Gerät','Device')],['wallet','Wallet'],['multisig','Multisig'],['liana','Liana'],['backup','Backup']];
      var printLegend=legendItems.filter(function(item){return g.nodes.some(function(n){return n.kind===item[0] || item[0]==='wallet'&&n.kind==='software';});}).map(function(item){return '<span>'+symbolHtml(symbolName({kind:item[0],id:''}))+safe(item[1])+'</span>';}).join('');
      var pageCount=Math.max(1,1+Math.ceil(Math.max(0,maxY-810)/930)),sheets=[];
      for(var page=0;page<pageCount;page++){
        var start=page?810+(page-1)*930:0,end=page?start+930:810;
        var pageMarkers=markers.replace(/id="dg-arrow-/g,'id="dg-arrow-'+page+'-');
        var pagePaths=paths.replace(/url\(#dg-arrow-/g,'url(#dg-arrow-'+page+'-');
        var pageCards=cards.filter(function(c){var p=positions[c.id];return p.y>=start && p.y+p.h<=end;}).map(function(c){return c.html;}).join('');
        var header=page===0?'<div class="dg-paper-head"><div class="dg-paper-brand"><img src="assets/clavastack-logo.png" alt=""><div><span>'+tr('GESAMTDIAGRAMM','FULL DIAGRAM')+'</span><strong>'+diagramTitle()+'</strong></div></div><div class="dg-paper-legend">'+printLegend+'</div><div class="dg-paper-seeds"><div class="dg-seed-key">'+key+'</div></div></div>':'';
        sheets.push('<section class="dg-print-sheet">'+header+'<div class="dg-print-window'+(page?' dg-print-window-next':'')+'"><div class="dg-canvas" style="width:'+width+'px;height:'+Math.max(320,maxY)+'px;transform:scale(.73) translateY(-'+start+'px)"><svg class="dg-edges" viewBox="0 0 '+width+' '+Math.max(320,maxY)+'" aria-hidden="true"><defs>'+pageMarkers+'</defs>'+pagePaths+dots+'</svg>'+pageCards+'</div></div></section>');
      }
      return '<div class="dg-print-pages">'+sheets.join('')+'</div>';
    }
    return (key?'<div class="dg-seed-key">'+key+'</div>':'')+'<div class="dg-scroll"><div class="dg-canvas" style="width:'+width+'px;height:'+Math.max(320,maxY)+'px"><svg class="dg-edges" viewBox="0 0 '+width+' '+Math.max(320,maxY)+'" aria-hidden="true"><defs>'+markers+'</defs>'+paths+dots+'</svg>'+cards.map(function(c){return c.html;}).join('')+'</div></div>';
  }
  function fitOverviewCanvas(){
    if(document.body.classList.contains('diagram-print') || viewMode!=='overview') return;
    var scroll=document.querySelector('#diagram-view .dg-scroll'),canvas=scroll&&scroll.querySelector('.dg-canvas');
    if(!scroll||!canvas) return;
    var width=parseFloat(canvas.style.width)||1370,height=parseFloat(canvas.style.height)||320;
    var scale=Math.min(1,Math.max(.45,(scroll.clientWidth-2)/width));
    canvas.style.transformOrigin='0 0';
    canvas.style.transform='scale('+scale+')';
    scroll.style.height=Math.ceil(height*scale+2)+'px';
    scroll.style.overflow='hidden';
  }
  function flowCard(root,children,g){
    return '<section class="dg-flow-card"><div class="dg-flow">'+nodeHtml(root)+
      (children.length?'<div class="dg-flow-arrow" aria-hidden="true">→</div><div class="dg-flow-targets">'+children.map(function(c){
        var target=g.byId[c.to]; if(!target) return '';
        var next=g.edges.filter(function(e){return e.from===c.to && g.byId[e.to] && g.byId[e.to].kind==='software';});
        return '<div class="dg-flow-target"><span class="dg-edge-tag">'+safe(c.text)+'</span>'+nodeHtml(target)+
          next.map(function(e){return '<span class="dg-inline-arrow" aria-hidden="true">→</span>'+nodeHtml(g.byId[e.to]);}).join('')+'</div>';
      }).join('')+'</div>':'')+'</div></section>';
  }
  function cards(g){
    if(!g.nodes.length) return '<div class="dg-empty">'+tr('Noch keine Angaben im Plan.','No plan details yet.')+'</div>';
    var parts=[],shown={};
    g.nodes.filter(function(n){return n.kind==='seed';}).forEach(function(n){
      var outgoing=g.edges.filter(function(e){return e.from===n.id && g.byId[e.to] && !/^(ms|liana)-/.test(e.to);});
      parts.push(flowCard(n,outgoing,g)); shown[n.id]=true;
      outgoing.forEach(function(e){shown[e.to]=true; g.edges.filter(function(x){return x.from===e.to && g.byId[x.to] && g.byId[x.to].kind==='software';}).forEach(function(x){shown[x.to]=true;});});
    });
    g.nodes.filter(function(n){return n.kind==='multisig'||n.kind==='liana';}).forEach(function(n){
      var incoming=g.edges.filter(function(e){return e.to===n.id && g.byId[e.from];});
      var after=g.edges.filter(function(e){return e.from===n.id && g.byId[e.to];});
      var h='<section class="dg-flow-card dg-composite"><div class="dg-flow">';
      if(incoming.length) h+='<div class="dg-flow-sources">'+incoming.map(function(e){return '<div class="dg-flow-source">'+nodeHtml(g.byId[e.from])+'<span class="dg-edge-tag">'+safe(e.text)+'</span></div>';}).join('')+'</div><div class="dg-flow-arrow" aria-hidden="true">→</div>';
      h+=nodeHtml(n);
      if(after.length) h+='<div class="dg-flow-arrow" aria-hidden="true">→</div><div class="dg-flow-targets">'+after.map(function(e){return nodeHtml(g.byId[e.to]);}).join('')+'</div>';
      parts.push(h+'</div></section>'); shown[n.id]=true;
      incoming.forEach(function(e){shown[e.from]=true;}); after.forEach(function(e){shown[e.to]=true;});
    });
    var remaining=g.nodes.filter(function(n){return !shown[n.id];});
    if(remaining.length) parts.push('<section class="dg-flow-card dg-other"><div class="dg-other-grid">'+remaining.map(nodeHtml).join('')+'</div></section>');
    return '<div class="dg-card-stack">'+parts.join('')+'</div>';
  }
  function paginateCards(g){
    var main=document.querySelector('#diagram-view .dg-main'),stack=main&&main.querySelector('.dg-card-stack');
    if(!stack) return;
    var measure=document.createElement('div');
    measure.className='dg-card-measure dg-paper-mode';
    measure.innerHTML=stack.outerHTML;
    document.body.appendChild(measure);
    var cardNodes=Array.prototype.slice.call(measure.querySelectorAll('.dg-flow-card'));
    var limit=164*96/25.4,gap=4*96/25.4,pages=[[]],height=0;
    cardNodes.forEach(function(card){
      var cardHeight=card.getBoundingClientRect().height;
      if(height && height+gap+Math.min(cardHeight,limit)>limit){pages.push([]);height=0;}
      var scale=Math.min(1,limit/cardHeight),content=card.outerHTML;
      if(scale<1) content='<div class="dg-card-scale" style="height:'+Math.floor(cardHeight*scale)+'px"><div style="transform:scale('+scale+')">'+content+'</div></div>';
      pages[pages.length-1].push(content);
      height+=Math.min(cardHeight,limit)+(height?gap:0);
    });
    measure.remove();
    var legendItems=[['seed','Seed'],['derived','BIP85'],['device',tr('Gerät','Device')],['wallet','Wallet'],['multisig','Multisig'],['liana','Liana'],['backup','Backup']];
    var legend=legendItems.filter(function(item){return g.nodes.some(function(n){return n.kind===item[0] || item[0]==='wallet'&&n.kind==='software';});}).map(function(item){return '<span>'+symbolHtml(symbolName({kind:item[0],id:''}))+safe(item[1])+'</span>';}).join('');
    var header='<div class="dg-paper-head dg-card-head"><div class="dg-paper-brand"><img src="assets/clavastack-logo.png" alt=""><div><span>'+tr('DIAGRAMMKARTEN','DIAGRAM CARDS')+'</span><strong>'+diagramTitle()+'</strong></div></div><div class="dg-paper-legend">'+legend+'</div></div>';
    main.innerHTML='<div class="dg-print-pages">'+pages.map(function(items){return '<section class="dg-print-sheet">'+header+'<div class="dg-card-page">'+items.join('')+'</div></section>';}).join('')+'</div>';
  }
  function paint(printLayout){
    var g=model(),host=document.getElementById('diagram-view');
    function legend(kind,label,usedKinds){
      var used=usedKinds.some(function(candidate){return g.nodes.some(function(n){return n.kind===candidate;});});
      return used?'<span>'+symbolHtml(symbolName({kind:kind,id:''}))+safe(label)+'</span>':'';
    }
    var usedKinds={seed:['seed'],derived:['derived'],device:['device'],wallet:['wallet','software'],multisig:['multisig'],liana:['liana'],backup:['backup']};
    host.innerHTML='<div class="dg-shell'+(printLayout?' dg-paper-mode':'')+'"><div class="dg-toolbar"><div class="dg-title"><span class="dg-print-logo" aria-label="ClavaStack">CLAVA<span>STACK</span></span><div><div class="dg-kicker">'+(viewMode==='overview'?tr('GESAMTDIAGRAMM','FULL DIAGRAM'):tr('DIAGRAMMKARTEN','DIAGRAM CARDS'))+'</div><h1>'+diagramTitle()+'</h1></div></div><div class="dg-actions">'+
      '<button type="button" class="dg-tab'+(viewMode==='overview'?' active':'')+'" onclick="setDiagramMode(\'overview\')">'+tr('Gesamtdiagramm','Full diagram')+'</button>'+
      '<button type="button" class="dg-tab'+(viewMode==='cards'?' active':'')+'" onclick="setDiagramMode(\'cards\')">'+tr('Diagrammkarten','Diagram cards')+'</button>'+
      '<button type="button" class="dg-print" onclick="printDiagram()">'+symbolHtml('printer')+tr('Als PDF drucken','Print PDF')+'</button>'+
      '<button type="button" class="dg-close" onclick="closeDiagram()">× <span>'+tr('Zurück','Back')+'</span></button></div></div>'+
      '<div class="dg-legend">'+legend('seed','Seed',usedKinds.seed)+legend('derived','BIP85',usedKinds.derived)+legend('device',tr('Gerät','Device'),usedKinds.device)+legend('wallet','Wallet',usedKinds.wallet)+legend('multisig','Multisig',usedKinds.multisig)+legend('liana','Liana',usedKinds.liana)+legend('backup','Backup',usedKinds.backup)+'</div>'+
      '<main class="dg-main">'+(viewMode==='overview'?overview(g,printLayout):cards(g))+'</main></div>';
    if(!printLayout && viewMode==='overview') requestAnimationFrame(fitOverviewCanvas);
  }
  window.openDiagram=function(mode){viewMode=mode==='cards'?'cards':'overview';document.body.classList.add('diagram-open');document.getElementById('app-ui').style.display='none';document.getElementById('diagram-view').hidden=false;paint();window.scrollTo(0,0);};
  window.setDiagramMode=function(mode){viewMode=mode==='cards'?'cards':'overview';paint();window.scrollTo(0,0);};
  window.addEventListener('resize',fitOverviewCanvas);
  window.closeDiagram=function(){document.getElementById('diagram-view').hidden=true;document.getElementById('app-ui').style.display='';document.body.classList.remove('diagram-print','diagram-open','dg-sheet-print');window.scrollTo(0,0);};
  var diagramPrintPending=false,diagramPrintPrepared=false;
  window.prepareDiagramPrint=function(){
    if(diagramPrintPrepared) return;
    diagramPrintPrepared=true;
    document.body.classList.add('diagram-print');
    document.body.classList.add('dg-sheet-print');
    paint(true);
    if(viewMode==='cards') paginateCards(model());
  };
  function finishDiagramPrint(){
    if(!diagramPrintPrepared) return;
    diagramPrintPrepared=false;
    diagramPrintPending=false;
    document.body.classList.remove('diagram-print','dg-sheet-print');
    paint();
  }
  window.addEventListener('beforeprint',window.prepareDiagramPrint);
  window.addEventListener('afterprint',finishDiagramPrint);
  window.printDiagram=function(){
    if(diagramPrintPending) return;
    diagramPrintPending=true;
    window.prepareDiagramPrint();
    var images=Array.prototype.slice.call(document.querySelectorAll('#diagram-view .dg-icon img'));
    var ready=images.map(function(img){
      if(img.complete) return Promise.resolve();
      return new Promise(function(resolve){img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});});
    });
    var symbolSources={};
    Array.prototype.forEach.call(document.querySelectorAll('#diagram-view .dg-symbol'),function(el){symbolSources[el.getAttribute('data-src')]=true;});
    Object.keys(symbolSources).forEach(function(src){
      ready.push(new Promise(function(resolve){var img=new Image();img.onload=resolve;img.onerror=resolve;img.src=src;}));
    });
    ready.push(document.fonts?document.fonts.ready:Promise.resolve());
    Promise.all(ready).then(function(){requestAnimationFrame(function(){requestAnimationFrame(function(){window.print();});});}).catch(finishDiagramPrint);
  };
})();
