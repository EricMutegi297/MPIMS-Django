export const RTA_CASE_TYPE = "rta";

const RTA_TEXT = "road traffic accident";

export const ROAD_TRAFFIC_ACCIDENT_LABELS = [
  "Injury Road Traffic Accident",
  "Non-Injury Road Traffic Accident",
  "Self Involved Road Traffic Accident",
  "Fatal Road Traffic Accident",
  "Hit and Run Road Traffic Accident",
];

export function isRoadTrafficAccidentCase(caseObj) {
  if (!caseObj) return false;
  return [
    caseObj.case_type,
    caseObj.offence,
    caseObj.offence_name,
    caseObj.title,
    caseObj.source_incident_type,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(RTA_TEXT));
}

export function isRoadTrafficAccidentIncident(incident) {
  if (!incident) return false;
  return [
    incident.incident_type,
    incident.description,
    incident.source_ob_number,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(RTA_TEXT));
}
