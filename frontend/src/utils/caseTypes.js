export const RTA_CASE_TYPE = "rta";

const RTA_TEXT = "road traffic accident";

export const ROAD_TRAFFIC_ACCIDENT_LABELS = [
  "Injury Road Traffic Accident",
  "Non-Injury Road Traffic Accident",
  "Self Involved Road Traffic Accident",
  "Fatal Road Traffic Accident",
  "Hit and Run Road Traffic Accident",
];

function asArray(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.results) ? value.results : [];
}

export function isRoadTrafficAccidentCase(caseObj) {
  if (!caseObj) return false;
  if (String(caseObj.case_type || "").toLowerCase() === RTA_CASE_TYPE) return true;
  return [
    caseObj.offence,
    caseObj.offence_name,
    caseObj.title,
    caseObj.source_incident_type,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(RTA_TEXT));
}

function textSection(text, label) {
  const raw = String(text || "");
  if (!raw) return "";
  const marker = raw.toLowerCase().indexOf(label.toLowerCase());
  if (marker < 0) return "";
  const afterMarker = raw.slice(marker + label.length).replace(/^[:\s]+/, "");
  const nextSection = afterMarker.search(/\n{2,}[A-Z][^:\n]{2,80}:\s*/);
  return (nextSection >= 0 ? afterMarker.slice(0, nextSection) : afterMarker).trim();
}

export function caseDisplayDescription(caseObj) {
  const description = String(caseObj?.description || "").trim();
  if (!isRoadTrafficAccidentCase(caseObj)) return description;
  return (
    String(caseObj?.source_incident_history || "").trim()
    || textSection(description, "History of the Accident")
    || description
  );
}

export function caseAccusedUnitLabel(caseObj) {
  const units = [
    caseObj?.accused_unit_name,
    ...asArray(caseObj?.accused_entries).map((entry) => entry?.unit_name || entry?.unit),
    caseObj?.source_incident_unit,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);

  const uniqueUnits = [...new Set(units)];
  return uniqueUnits.join("; ") || caseObj?.submitting_unit_name || "";
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
