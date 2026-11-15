import Foundation
import Capacitor
import UIKit

/// Oeffnet den System-Druckdialog fuer den WebView-Inhalt. Dort kann der Nutzer
/// "Als PDF sichern" waehlen (Teilen-Symbol oben rechts im Druckdialog).
@objc(NativePrintPlugin)
public class NativePrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativePrintPlugin"
    public let jsName = "NativePrint"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise)
    ]

    @objc func print(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "Document"
        let landscape = call.getBool("landscape") ?? false
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                call.reject("WebView not available")
                return
            }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = name
            info.orientation = landscape ? .landscape : .portrait
            let controller = UIPrintInteractionController.shared
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()
            controller.present(animated: true) { _, completed, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["completed": completed])
                }
            }
        }
    }
}
