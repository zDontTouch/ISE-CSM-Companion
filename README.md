# ISE Case Solving Methodology Companion
The ISE CSM Companion is a script for the SAP Integrated Support Environment that aims to improve the visibility of the different case solving methodologies by embedding a little draggable companion element which quickly shows indicators for the methodologies, and also provide insights on how to improve their adoption.
In ServiceNow currently there is no way to easily assess the status of the different methodologies used in Product Support (Pulse, Error Categorization, Swarming and KBAs). As a firm believer that UX has a protagonist role in driving adoption forward, I developed this tool to tackle this visibility flaw.
<p align="center">
  <img src="https://github.com/zDontTouch/ISE-CSM-Companion/blob/55c4f80b257a77248a166d19aa1a546bb1a97fe2/screenshots/CSM_Companion_1.png" />
</p>
The companion automatically appears whenever a ServiceNow case is open, and can be positioned anywhere in the screen by simply dragging it. The position of the companion is persistent between cases and between ISE sessions.</br></br>
Aside from directly showing the status of each case solving methodology, the CSM Companion includes a CSM Insights button, which analyzes several criteria of the case which is currently open, and list ideas on how to possibly improve the relevant methodologies. The insights panel is linked to the main companion, so it can also be dragged.
<p align="center">
  <img src="https://github.com/zDontTouch/ISE-CSM-Companion/blob/55c4f80b257a77248a166d19aa1a546bb1a97fe2/screenshots/CSM_Companion_3.png" />
</p>
Thinking about users that prefer minimalism, and also users who may only use the notebook screen without an additional monitor, the Companion also has a toggleable compact mode which preserves all the features from the full-size version.
<p align="center">
  <img src="https://github.com/zDontTouch/ISE-CSM-Companion/blob/845af7c437015f5dace9c1f06f5b6625977d12cd/screenshots/CSM_Companion_2.png" />
</p>
Users can hover each "status light" to check details on the respective methodology.
<p align="center">
  <img src="https://github.com/zDontTouch/ISE-CSM-Companion/blob/845af7c437015f5dace9c1f06f5b6625977d12cd/screenshots/CSM_Companion_Hover.png" />
</p>

### Currently Included CSM Insights
* Pulse completion
* Pulse last updated by a different user
* Pulse not updated for more than 48 hours
* Suggestion for Pulse completion for Service Requests
* Pulse not updated after last customer response
* Pulse not updated after incident reply
* KBA attached by the current processor
* No KBA added in the last 5 days
* KBA attached is mentioned in Pulse
* (AI) Pulse steps to reproduce are numbered
* (AI) Attachments from case are mentioned in Pulse
* (AI) Case description contains an error message
* Suggest How-To Redirect for how-to cases
