// ==UserScript==
// @name     ServiceNow Pulse Companion
// @version  1.0
// @grant    none
// @match    *://itsm.services.sap/*
// @include  *://itsm.services.sap/*
// @exclude  *://itsm.services.sap/attach_knowledge*
// ==/UserScript==

/*
 * For example cases you can check Guided Engineering backend:
 * https://supportportaltest-ge-approuter.internal.cfapps.sap.hana.ondemand.com/ahui/#/SupportCase
 */
let ipcRenderer = null;
if (typeof require !== "undefined") {
  ipcRenderer = require("electron").ipcRenderer;
} else {
  ipcRenderer = {
    invoke: ise.events.send,
    on: ise.events.on,
    off: ise.events.off,
  };
}

const forceEnv = null;

// Exposed functions
API = {
  openQuickView,
  sendAnalytics,
  getTemplates,
  Pulse: {
    get: getPulse,
    update: updatePulse,
  },
  GuidedEngineering: {
    getHistoryData,
    getAvailableAutomationsForComponent,
    executeAutomation,
    addFeedbackForAutomation,
  },
};

/**
 * Get pulse record
 */
async function getPulse(case_id) {
  try {
    const res = await caRequest(`/case/pulse/${case_id}`);
    if (res?.length) {
      return res[0];
    }
    if (Array.isArray(res) && res.length === 0) {
      return "New";
    }
    return null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * Update pulse record
 */
async function updatePulse(case_id, data) {
  const res = await caRequest(`/case/pulse/${case_id}`, "POST", data);
  return res;
}

function higherVersion(v1, v2) {
  var v1parts = v1.split(".").map(Number);
  var v2parts = v2.split(".").map(Number);
  for (var i = 0; i < v1parts.length; ++i) {
    if (v2parts.length == i) {
      return v1;
    }
    if (v1parts[i] == v2parts[i]) {
      continue;
    } else if (v1parts[i] > v2parts[i]) {
      return v1;
    } else {
      return v2;
    }
  }
  if (v1parts.length != v2parts.length) {
    return v2;
  }
  return v1;
}

async function getTemplates() {
  try {
    const minVersion = "1.6.44";
    const iseVersion = await window.ise.system_info.getISEVersion();
    if (higherVersion(iseVersion, minVersion) === minVersion) {
      return [];
    }
    const res = await ipcRenderer.invoke("engine-case-get-templates");
    if (!res?.length) {
      return null;
    }
    const parsed = JSON.parse(res);
    const parsedKeys = Object.keys(parsed);
    const templates = [];
    for (let i = 0; i < parsedKeys.length; i++) {
      if (parsedKeys[i].startsWith("template_metadata_")) {
        const template = JSON.parse(parsed[parsedKeys[i]]);
        const templateText = parsed["template_text_" + template.id];
        templates.push({ title: template.title, description: "Maintained by the ServiceNow Tools script.", content: templateText });
      }
    }
    return templates;
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function openQuickView(url) {
  ipcRenderer.invoke("browserwindow-isewindow-popupwindow-open", url);
}

/**
 * Get Intelligent Automation history for a given correlation id
 */
async function getHistoryData(correlation_id) {
  const res = await iaRequest(`/automations/history/${correlation_id}`);
  if (res?.length) {
    res.sort((a, b) => {
      try {
        if (a?.status === "RUNNING") return -1;
        if (b?.status === "RUNNING") return -1;
        if (moment(a?.completed_ts) > moment(b?.completed_ts)) {
          return -1;
        }
        return 1;
      } catch (e) {
        return 1;
      }
    });
  }
  return res;
}

/**
 * Add feedback for automation
 */
async function addFeedbackForAutomation(automation_id, workflow_id, val) {
  let payload = {
    automation_id,
    workflow_id,
  };
  if (val === null) {
    payload.thumb_up = false;
    payload.thumb_down = false;
  } else {
    if (val) {
      payload.thumb_up = true;
      payload.thumb_down = false;
    } else {
      payload.thumb_up = false;
      payload.thumb_down = true;
    }
  }
  const res = await iaRequest(`/automation/feedback`, "POST", payload);
  return res;
}

/**
 * Get list of Intelligent Automation automations
 */
async function getAvailableAutomationsForComponent(component, product_name) {
  let res = null;
  if (product_name?.length) {
    res = await iaRequest(`/automations/${component}?product=${encodeURIComponent(product_name)}`);
  } else {
    res = await iaRequest(`/automations/${component}`);
  }
  return res;
}

/**
 * Execute an automation for a case
 */
async function executeAutomation(automation_id, correlation_id, component, runtimeOptions) {
  let options = [];
  if (runtimeOptions) {
    runtimeOptions = Object.values(runtimeOptions);
  }
  if (runtimeOptions?.length) {
    for (let i = 0; i < runtimeOptions.length; i++) {
      let values = [];
      // Selectbox
      if (runtimeOptions[i]?.control === "selectbox") {
        if (runtimeOptions[i].values?.value) {
          // Single
          values = [runtimeOptions[i].values.value];
        } else {
          // Multi
          values = runtimeOptions[i].values.map((item) => item.value);
        }
      } else {
        // Freetext
        values = [runtimeOptions[i]?.value || ""];
      }
      options.push({
        name: runtimeOptions[i].option.name,
        values,
      });
    }
  }
  const res = await iaRequest(`/automation/execute`, "POST", {
    id: automation_id,
    incident_no: correlation_id,
    component,
    options,
  });
  return res;
}

/**
 * Sends analytics to HANA
 */
async function sendAnalytics(action, metadata = undefined) {
  ipcRenderer.invoke("engine-logger-track-hana", {
    view: "case_assistant",
    action,
    metadata,
  });
}

/**
 * Make request to backend-case-assistant
 */
let caToken = null;
async function caRequest(path, method = "GET", body = undefined) {
  if (!caToken) {
    const tokenRes = await ipcRenderer.invoke("engine-sso-request", {
      env: forceEnv || undefined,
      service: "supportportal_token",
    });
    caToken = tokenRes?.token;
  }
  const res = await ipcRenderer.invoke("engine-request", {
    service: "backend-case-assistant",
    method,
    env: forceEnv || undefined,
    body,
    path,
    headers: {
      Authorization: `Bearer ${caToken}`,
    },
  });
  return res;
}

/**
 * Make request to backend-guided-engineering
 */

async function iaRequest(path, method = "GET", body = undefined) {
  document.querySelector(".spinner").style.display = "block";

  const tokenRes = await ipcRenderer.invoke("engine-sso-request", {
    env: forceEnv || undefined,
    service: "guided-engineering-token",
  });
  let iaToken = tokenRes?.token;

  const res = await ipcRenderer.invoke("engine-request", {
    service: "backend-guided-engineering",
    method,
    env: forceEnv || undefined,
    body,
    path,
    headers: {
      Authorization: `Bearer ${iaToken}`,
    },
  });
  document.querySelector(".spinner").style.display = "none";
  return res;
}

/*****************************************************************************************************/

var defaultLeftPosition = "2.6%";
var defaultTopPosition = "60%";
var pulseCheckerDiv = document.createElement("div");
pulseCheckerDiv.setAttribute("id","checkerDiv");
document.body.appendChild(pulseCheckerDiv);
var pulseData = "";
var kcsCategorizeComplete = false;
var kcsInvestigateComplete = false;
var kcsCategorizationComplete = false;
var csmInsights = [];
var isKbaAttached = false;

//Set CSM Insight add function
function pushCsmInsight(insight){
  if(csmInsights.length==0){
    csmInsights.push(insight);
  }else{
    var insightExists = false;
    for(var i=0;i<csmInsights.length;i++){
      //only push if the insight is not yet added
      if(csmInsights[i].indexOf(insight)>=0){
        insightExists = true;
      }
    }
    if(!insightExists){
      csmInsights.push(insight);
    }
  }
}

//Set draggable box
var container = document.getElementById("checkerDiv");

function handleMouseMove(event){
  event.preventDefault();
  onMouseDrag(event.x,event.y);
}

function onMouseDrag(movementX, movementY){
  var containerStyle = window.getComputedStyle(container);
  var leftPosition = parseInt(containerStyle.left);
  var topPosition = parseInt(containerStyle.top);
  container.style.position = "absolute";
  container.style.left = movementX+"px";
  container.style.top = movementY+"px";
  defaultLeftPosition = movementX+"px";
  defaultTopPosition = movementY+"px";
}

container.addEventListener("mousedown", (e)=>{
  if(e.target.id != "insights"){
    document.addEventListener("mousemove", handleMouseMove);
  }else{
    e.preventDefault();
    alert(csmInsights.join("<br><br>"));
  }
});

document.addEventListener("mouseup",()=>{
  document.removeEventListener("mousemove", handleMouseMove);
});

//Setting content when case is opened
ise.case.onUpdate2(
    async (receivedCaseData) => {
      
        //clear any previous data
        csmInsights = [];

        //Hide if no case is open
        if(receivedCaseData){
          pulseCheckerDiv.setAttribute("style","display:none;")
        }
        
        //when a case is open, query the Pulse data
        pulseData = API.Pulse.get(receivedCaseData.id).then((pulse)=>{

        //Clear any previous data
        pulseCheckerDiv.innerHTML = "<div style=\"text-align: center; color: white;\"><h2 style=\"margin-top:4%; margin-bottom:0%;\">CSM Companion</h2><h4 style=\"margin-bottom:4%; margin-top:0%;\">"+receivedCaseData.headers.data.number+"</h4><h3 style=\"margin-bottom:0%;\">Pulse Completion</h3></div>";
        pulseCheckerDiv.setAttribute("style","display:block; position:absolute; z-index:99 ;top:"+defaultTopPosition+"; left:"+defaultLeftPosition+"; width:250px; height:385px; background-color:rgba(0, 0, 0, 0.65); border-radius:25px;");
        pulseCheckerDiv.setAttribute("id","checkerDiv");

        //If categorization is "service request", pulse is not required
        if(receivedCaseData.headers.data.resolutionError.category == "service_request"){
          kcsCategorizeComplete = true;
          kcsInvestigateComplete = true;
          var serviceRequestDiv = document.createElement("h4");
          serviceRequestDiv.setAttribute("style","text-align: center; color: PaleGreen; margin: 1%;");
          serviceRequestDiv.innerHTML = "Pulse Not Required (<abbr title=\"For Service Request cases, Pulse is not mandatory\"> ? </abbr>)";
          pulseCheckerDiv.appendChild(serviceRequestDiv);

          //CSM PULSE INSIGHTS
          //Service Request Pulse Completion
          pushCsmInsight("• Pulse completion is still suggested for Service Request Cases");

        }else{

          //CSM PULSE INSIGHTS
          //Pulse last update
          var updateDate = new Date(pulse.sys_updated_on+" UTC");
          var currentDate = new Date();
          //Calculate difference in ms then convert to hours   
          var updateTimeDifference = Math.abs(((updateDate.getTime() - currentDate.getTime())/(1000*60*60))); 
          if(updateTimeDifference >= 48){
            pushCsmInsight("• Pulse has not been updated in the last 48 hours. Check if the existing pulse can be improved with new info.");
          }
          //Pulse update user (disconsider when pulse change comes from Case Assistant)
          if(receivedCaseData.headers.data.processor != pulse.sys_updated_by && pulse.sys_updated_by!= "INT_ISE2SN"){
            pushCsmInsight("• Pulse was last updated by a different user. Check if the existing pulse can be improved with new info.");
          }


          //verify and list each section of pulse
          //Categorization
          var categorizeDiv = document.createElement("h4");
          categorizeDiv.setAttribute("style","text-align: center; color: white; margin: 1%;");
          try{
            categorizeDiv.innerHTML = "Categorize: "+verifyCategorizeSection(pulse)+"/5"+((!kcsCategorizeComplete)?" (<abbr style=\"text-decoration: none\" title=\"For KCS adoption, Symptom is mandatory\"> ⚠ </abbr>)":"");
            if(verifyCategorizeSection(pulse)==5){
              categorizeDiv.setAttribute("style","text-align: center; color: PaleGreen; margin: 1%;");
            }else if(verifyCategorizeSection(pulse)>0){
              categorizeDiv.setAttribute("style","text-align: center; color: Khaki; margin: 1%;");
            }else{
              categorizeDiv.setAttribute("style","text-align: center; color: LightCoral; margin: 1%;");
            }
          }catch(err){
            categorizeDiv.setAttribute("style","text-align: center; color: LightCoral; margin: 1%;");
            categorizeDiv.innerHTML = "Categorize: 0/5"+((!kcsCategorizeComplete)?" (<abbr title=\"For KCS adoption, Symptom is mandatory\"> ⚠ </abbr>)":"");
          }
          pulseCheckerDiv.appendChild(categorizeDiv);

          //Investigate
          var investigateDiv = document.createElement("h4");
          investigateDiv.setAttribute("style","text-align: center; color: white; margin: 1%;");
          try{
            investigateDiv.innerHTML = "Investigate: "+verifyInvestigateSection(pulse)+"/3"+((!kcsInvestigateComplete)?" (<abbr style=\"text-decoration: none\" title=\"For KCS adoption, at least one field must be filled\"> ⚠ </abbr>)":"");
            if(verifyInvestigateSection(pulse)==3){
              investigateDiv.setAttribute("style","text-align: center; color: PaleGreen; margin: 1%;");
            }else if(verifyInvestigateSection(pulse)>0){
              investigateDiv.setAttribute("style","text-align: center; color: Khaki; margin: 1%;");
            }else{
              investigateDiv.setAttribute("style","text-align: center; color: LightCoral; margin: 1%;");
            }
          }catch(err){
            investigateDiv.setAttribute("style","text-align: center; color: LightCoral; margin: 1%;");
            investigateDiv.innerHTML = "Investigate: 0/3"+((!kcsInvestigateComplete)?" (<abbr style=\"text-decoration: none\" title=\"For KCS adoption, at least one field must be filled\"> ⚠ </abbr>)":"");
          }
          pulseCheckerDiv.appendChild(investigateDiv);

          //Resolution
          var resolutionDiv = document.createElement("h4");
          resolutionDiv.setAttribute("style","text-align: center; color: white;  margin: 1%;");
          try{
            resolutionDiv.innerHTML = "Resolution: "+verifyResolutionSection(pulse)+"/4";
            if(verifyResolutionSection(pulse)==4){
              resolutionDiv.setAttribute("style","text-align: center; color: PaleGreen; margin: 1%;");
            }else if(verifyResolutionSection(pulse)>0){
              resolutionDiv.setAttribute("style","text-align: center; color: Khaki; margin: 1%;");
            }else{
              resolutionDiv.setAttribute("style","text-align: center; color: LightCoral; margin: 1%;");
            }
          }catch(err){
            resolutionDiv.setAttribute("style","text-align: center; color: LightCoral; margin: 1%;");
            resolutionDiv.innerHTML = "Resolution: 0/4";
          }
          pulseCheckerDiv.appendChild(resolutionDiv);
        }

        //Error Categorization check
        var errorCategorizationDiv = document.createElement("div");
        errorCategorizationDiv.setAttribute("style","text-align: center; color: white;");
        errorCategorizationDiv.innerHTML = "<h3 style=\"margin-bottom:0%;\">Error Categorization</h3>";
        var errorCategorizationIndicatorDiv = document.createElement("h4");
        if(receivedCaseData.headers.data.resolutionError.subcategory == ""){
          //check categories that do not have subcategory
          if(receivedCaseData.headers.data.resolutionError.category == "customer_partner_issue" || receivedCaseData.headers.data.resolutionError.category == "database_inconsistency" || receivedCaseData.headers.data.resolutionError.category == "3party_partner_issue"){
            errorCategorizationIndicatorDiv.setAttribute("style","color: PaleGreen; margin-top:0%;");
            errorCategorizationIndicatorDiv.innerHTML = "Complete";
            kcsCategorizationComplete = true;
          }else{
            errorCategorizationIndicatorDiv.setAttribute("style","color: LightCoral; margin-top:0%;");
            errorCategorizationIndicatorDiv.innerHTML = "Incomplete";
            kcsCategorizationComplete = false;
          }
        }else{
            errorCategorizationIndicatorDiv.setAttribute("style","color: PaleGreen; margin-top:0%;");
            errorCategorizationIndicatorDiv.innerHTML = "Complete";
            kcsCategorizationComplete = true;
        }
        errorCategorizationDiv.appendChild(errorCategorizationIndicatorDiv);
        pulseCheckerDiv.appendChild(errorCategorizationDiv);

        //PULSE INSIGHTS
        //How-to redirect
        if(receivedCaseData.headers.data.resolutionError.category == "customer_partner_issue" && (receivedCaseData.headers.data.resolutionError.subcategory == "how_to_request" || receivedCaseData.headers.data.resolutionError.subcategory == "consulting_implementation_request")){
          pushCsmInsight("• Case is eligible for How-To Redirect process according to the current error categorization. Proceed with How-To redirect process.")
        }

        //Swarming Check
        var swarmCheckDiv = document.createElement("div");
        swarmCheckDiv.setAttribute("style","text-align: center; color: white;");
        swarmCheckDiv.innerHTML = "<h3 style=\"margin-bottom:0%;\">Swarming</h3>";
        var swarmIndicatorDiv = document.createElement("h4");
        //Check if swarm exists by searching in the pulse research (internal) section
        try{
          if(pulse.research_internal.toString().toLowerCase().indexOf("-- swarm") != -1){
            swarmIndicatorDiv.setAttribute("style","color: PaleGreen; margin-top:0%;");
            swarmIndicatorDiv.innerHTML = "Swarm Created";
          }else{
            swarmIndicatorDiv.setAttribute("style","color: Khaki; margin-top:0%;");
            swarmIndicatorDiv.innerHTML = "No Swarm Detected";
          }
        }catch(err){
          swarmIndicatorDiv.setAttribute("style","color: Khaki; margin-top:0%;");
          swarmIndicatorDiv.innerHTML = "No Swarm Detected";
        }
        swarmCheckDiv.appendChild(swarmIndicatorDiv);
        pulseCheckerDiv.appendChild(swarmCheckDiv);

      //Check if KBA is attached by going through case memos
      let kbaAddBalace = 0;
      //count KBAs added and KBAs removed, then compare the numbers to check if a KBA is attached
      for(let i=0; i<receivedCaseData.communication.data.memos.length;i++){
        if(receivedCaseData.communication.data.memos[i].text.toString().toLowerCase().indexOf(" has been attached - ")>=0){
          kbaAddBalace++;
        }else if(receivedCaseData.communication.data.memos[i].text.toString().toLowerCase().indexOf(" has been removed.")>=0){
          kbaAddBalace--;
        }
      }
      //At the end if balance >0, there is a KBA added
      var kbaCheckDiv = document.createElement("div");
      kbaCheckDiv.setAttribute("style","text-align: center; color: white;");
      kbaCheckDiv.innerHTML = "<h3 style=\"margin-bottom:0%;\">KBA</h3>";
      var kbaIndicatorDiv = document.createElement("h4");
      if(kbaAddBalace>0){
        isKbaAttached = true;
        kbaIndicatorDiv.setAttribute("style","color: PaleGreen; margin-top:0%;");
        kbaIndicatorDiv.innerHTML = "KBA Attached";
      }else{
        isKbaAttached = false;
        kbaIndicatorDiv.setAttribute("style","color: LightCoral; margin-top:0%;");
        kbaIndicatorDiv.innerHTML = "KBA Not Detected";
      }
      kbaCheckDiv.appendChild(kbaIndicatorDiv);
      pulseCheckerDiv.appendChild(kbaCheckDiv);
              
        //Add result KCS status check and CSM Insights
        var csmInsightsDiv = document.createElement("h2");
        csmInsightsDiv.setAttribute("style","text-align: center; color: white; margin-top:-1%;");
        csmInsightsDiv.innerHTML = "<button style=\"align-items: center; padding: 6px 14px; border-radius: 6px; border: none; background: #6E6D70; box-shadow: 0px 0.5px 1px rgba(0, 0, 0, 0.1); color: #DFDEDF;\" id=\"insights\">🛈 CSM Insights 🛈</button>";

        pulseCheckerDiv.appendChild(csmInsightsDiv);
          
        });

        
        document.body.appendChild(pulseCheckerDiv);

  },
  //this seems to be what requests communication data from case
  ["communication","headers"]);
  

  function verifyCategorizeSection(pulse){
    let counter = 0;
    kcsCategorizeComplete = false;
    if(trimPulseField(pulse.symptom).length > 2){
      counter++;
      //According to KCS, pulse needs at least the symptom to be considered complete
      kcsCategorizeComplete = true;
    }
    if(trimPulseField(pulse.environment).length > 2){
      counter++;
    }
    if(trimPulseField(pulse.steps_to_reproduce).length > 2){
      counter++;
    }
    if(trimPulseField(pulse.business_impact).length > 2){
      counter++;
    }
    if(trimPulseField(pulse.customer_contacts).length > 2){
      counter++;
    }

    return counter;
  }

  function verifyInvestigateSection(pulse){
    let counter = 0;
    kcsInvestigateComplete = false;
    if(trimPulseField(pulse.data_collected).length > 2){
      counter++;
    }
    if(trimPulseField(pulse.research).length > 2){
      counter++;
    }
    if(trimPulseField(pulse.research_internal).length > 2){
      counter++;
    }

    //According to KCS, pulse needs at least 1 field complete for Investigate and Diagnose
    if(counter > 0){
      kcsInvestigateComplete = true;
    }
    return counter;
  }

  function verifyResolutionSection(pulse){
    let counter = 0;
    if(trimPulseField(pulse.cause).length > 2){
      counter++;
    }
    if(trimPulseField(pulse.solution).length > 2){
      counter++;
    }
    if(trimPulseField(pulse.see_also).length > 2){
      counter++;
    }
    if(trimPulseField(pulse.internal_memo_html).length > 2){
      counter++;
    }

    return counter;
  }

  function trimPulseField(fieldData){
    let trimmedValue = fieldData.substring(3);
    trimmedValue = trimmedValue.substring(0,(trimmedValue.length-4));
    return trimmedValue;
  }

