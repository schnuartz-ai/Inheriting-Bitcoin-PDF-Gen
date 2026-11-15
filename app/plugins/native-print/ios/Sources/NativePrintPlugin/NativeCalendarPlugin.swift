import Foundation
import Capacitor
import EventKit
import EventKitUI
import UIKit

/// Opens the system "Add event" dialog with a prefilled, yearly repeating event.
/// The user saves the event. From iOS 17 on no calendar permission is needed for this.
@objc(NativeCalendarPlugin)
public class NativeCalendarPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "NativeCalendarPlugin"
    public let jsName = "NativeCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addEvent", returnType: CAPPluginReturnPromise)
    ]

    private let store = EKEventStore()
    private var pending: CAPPluginCall?

    @objc func addEvent(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let notes = call.getString("notes") ?? ""
        let start = call.getDouble("start") ?? 0
        var end = call.getDouble("end") ?? 0
        let rrule = call.getString("rrule") ?? ""
        if start <= 0 {
            call.reject("start missing")
            return
        }
        if end <= start { end = start + 45 * 60 * 1000 }

        let present = {
            DispatchQueue.main.async {
                let event = EKEvent(eventStore: self.store)
                event.title = title
                event.notes = notes
                event.startDate = Date(timeIntervalSince1970: start / 1000)
                event.endDate = Date(timeIntervalSince1970: end / 1000)
                if let cal = self.store.defaultCalendarForNewEvents { event.calendar = cal }
                if rrule.uppercased().contains("FREQ=YEARLY") {
                    event.addRecurrenceRule(EKRecurrenceRule(recurrenceWith: .yearly, interval: 1, end: nil))
                }
                event.addAlarm(EKAlarm(relativeOffset: -7 * 24 * 60 * 60))
                event.addAlarm(EKAlarm(relativeOffset: 0))

                let controller = EKEventEditViewController()
                controller.eventStore = self.store
                controller.event = event
                controller.editViewDelegate = self
                self.pending = call
                guard let host = self.bridge?.viewController else {
                    call.reject("view controller not available")
                    self.pending = nil
                    return
                }
                host.present(controller, animated: true)
            }
        }

        if #available(iOS 17.0, *) {
            present()
        } else {
            store.requestAccess(to: .event) { granted, _ in
                if granted { present() } else { call.reject("calendar access denied") }
            }
        }
    }

    public func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        controller.dismiss(animated: true) {
            self.pending?.resolve(["saved": action == .saved])
            self.pending = nil
        }
    }
}
