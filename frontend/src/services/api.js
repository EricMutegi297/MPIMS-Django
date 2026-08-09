
import api from "../axiosConfig";

const USER_CACHE_KEY = "mpims_user_cache";

function clearSession() {
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("refresh_token");
  sessionStorage.removeItem(USER_CACHE_KEY);
}

function storeAuthPayload(data = {}) {
  if (data.access) {
    sessionStorage.setItem("access_token", data.access);
  }
  if (data.refresh) {
    sessionStorage.setItem("refresh_token", data.refresh);
  }
  if (data.user) {
    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.user));
  }
}

export const offenceService = {
  list: () => api.get("/api/offences/"),
  get: (id) => api.get(`/api/offences/${id}/`),
  create: (data) => api.post("/api/offences/", data),
  update: (id, data) => api.put(`/api/offences/${id}/`, data),
  delete: (id) => api.delete(`/api/offences/${id}/`),
};

export const authService = {
  login: async (service_number, password) => {
    clearSession();
    const res = await api.post("/api/auth/login/", { service_number, password });
    storeAuthPayload(res.data);
    return res;
  },
  verifyTotpLogin: async (challenge_id, code) => {
    clearSession();
    const res = await api.post("/api/auth/totp/login/verify/", { challenge_id, code });
    storeAuthPayload(res.data);
    return res;
  },
  logout: async () => {
    try {
      return await api.post("/api/auth/logout/");
    } finally {
      clearSession();
    }
  },
  me: () => api.get("/api/auth/me/"),
  changePassword: async (data) => {
    const res = await api.post("/api/auth/change-password/", data);
    storeAuthPayload(res.data);
    return res;
  },
  requestPasswordReset: (email) => api.post("/api/auth/password-reset/", { email }),
  confirmPasswordReset: (data) => api.post("/api/auth/password-reset/confirm/", data),
  totpStatus: () => api.get("/api/auth/totp/status/"),
  setupTotp: (data = {}) => api.post("/api/auth/totp/setup/", data),
  confirmTotpSetup: async (code) => {
    const res = await api.post("/api/auth/totp/setup/confirm/", { code });
    storeAuthPayload(res.data);
    return res;
  },
  resetUserTotp: (id) => api.post(`/api/auth/users/${id}/totp-reset/`),
};

export const caseService = {
  list: (params) => api.get("/api/cases/", { params }),
  get: (id) => api.get(`/api/cases/${id}/`),
  activity: (id) => api.get(`/api/cases/${id}/activity/`),
  statistics: (params) => api.get("/api/cases/statistics/", { params }),
  briefableCases: () => api.get("/api/cases/briefable-cases/"),
  briefs: () => api.get("/api/cases/briefs/"),
  backBriefs: () => api.get("/api/cases/back-briefs/"),
  create: (formData) => api.post("/api/cases/", formData),
  update: (id, data) => api.patch(`/api/cases/${id}/`, data),
  taskCase: (id, formData) => api.patch(`/api/cases/${id}/`, formData),
  close: (id, formData) => api.patch(`/api/cases/${id}/`, formData),
  listCourtHearings: (id) => api.get(`/api/cases/${id}/court-hearings/`),
  addCourtHearing: (id, data) => api.post(`/api/cases/${id}/court-hearings/`, data),
  updateCourtHearing: (id, hearingId, data) => api.patch(`/api/cases/${id}/court-hearings/${hearingId}/`, data),
  deleteCourtHearing: (id, hearingId) => api.delete(`/api/cases/${id}/court-hearings/${hearingId}/`),
  listCourtMilestones: (id) => api.get(`/api/cases/${id}/court-milestones/`),
  addCourtMilestone: (id, data) => api.post(`/api/cases/${id}/court-milestones/`, data),
  updateCourtMilestone: (id, milestoneId, data) => api.patch(`/api/cases/${id}/court-milestones/${milestoneId}/`, data),
  deleteCourtMilestone: (id, milestoneId) => api.delete(`/api/cases/${id}/court-milestones/${milestoneId}/`),
  delete: (id) => api.delete(`/api/cases/${id}/`),
};

export const attachmentService = {
  list: (caseId) => api.get(`/api/cases/${caseId}/attachments/`),
  upload: (caseId, formData) => api.post(`/api/cases/${caseId}/attachments/`, formData),
  delete: (caseId, attId) => api.delete(`/api/cases/${caseId}/attachments/${attId}/`),
  activity: (caseId) => api.get(`/api/cases/${caseId}/activity/`),
};

export const caseBriefService = {
  get: (caseId) => api.get(`/api/cases/${caseId}/brief/`),
  upload: (caseId, formData) => api.post(`/api/cases/${caseId}/brief/`, formData),
  update: (caseId, formData) => api.patch(`/api/cases/${caseId}/brief/`, formData),
  approve: (caseId, data = {}) => api.post(`/api/cases/${caseId}/brief/approve/`, data),
  uploadBackBrief: (caseId, formData) => api.post(`/api/cases/${caseId}/back-brief/`, formData),
};

export const exhibitService = {
  list: (params) => api.get("/api/cases/exhibits/", { params }),
  eligibleCases: () => api.get("/api/cases/exhibits/eligible-cases/"),
  storageDestinations: () => api.get("/api/cases/exhibits/storage-destinations/"),
  create: (formData) => api.post("/api/cases/exhibits/", formData),
  approve: (id, data = {}) => api.post(`/api/cases/exhibits/${id}/approve/`, data),
  decline: (id, data = {}) => api.post(`/api/cases/exhibits/${id}/decline/`, data),
  store: (id, data = {}) => api.post(`/api/cases/exhibits/${id}/store/`, data),
  requestLifecycle: (id, formData) => api.post(`/api/cases/exhibits/${id}/request-lifecycle/`, formData),
  approveLifecycle: (id, data = {}) => api.post(`/api/cases/exhibits/${id}/approve-lifecycle/`, data),
  declineLifecycle: (id, data = {}) => api.post(`/api/cases/exhibits/${id}/decline-lifecycle/`, data),
  scanReleaseDocument: () => api.post("/api/cases/exhibits/scan-release-document/", {}, { responseType: "blob" }),
};

export const incidentService = {
  list: (params) => api.get("/api/incidents/", { params }),
  get: (id) => api.get(`/api/incidents/${id}/`),
  create: (data) => api.post("/api/incidents/", data),
  update: (id, data) => api.patch(`/api/incidents/${id}/`, data),
  convertToCase: (id, data) => api.post(`/api/incidents/${id}/convert-to-case/`, data),
  delete: (id) => api.delete(`/api/incidents/${id}/`),
};

export const dutyRoomService = {
  rosters: (params) => api.get("/api/dutyrooms/rosters/", { params }),
  getRoster: (id) => api.get(`/api/dutyrooms/rosters/${id}/`),
  createRoster: (data) => api.post("/api/dutyrooms/rosters/", data),
  updateRoster: (id, data) => api.patch(`/api/dutyrooms/rosters/${id}/`, data),
  deleteRoster: (id) => api.delete(`/api/dutyrooms/rosters/${id}/`),
  forwardRoster: (id, data) => api.post(`/api/dutyrooms/rosters/${id}/forward/`, data),
  approveRoster: (id, data = {}) => api.post(`/api/dutyrooms/rosters/${id}/approve/`, data),
  returnRoster: (id, data) => api.post(`/api/dutyrooms/rosters/${id}/return/`, data),
  declineRoster: (id, data) => api.post(`/api/dutyrooms/rosters/${id}/decline/`, data),
  publishRoster: (id) => api.post(`/api/dutyrooms/rosters/${id}/publish/`),
  approvers: () => api.get("/api/dutyrooms/rosters/approvers/"),
  activeDutyRoom: () => api.get("/api/dutyrooms/rosters/active-duty-room/"),
  entries: (params) => api.get("/api/dutyrooms/entries/", { params }),
  trafficStatistics: (params) => api.get("/api/dutyrooms/entries/traffic-statistics/", { params }),
  unitOptions: (params) => api.get("/api/dutyrooms/entries/unit-options/", { params }),
  createEntry: (data) => api.post("/api/dutyrooms/entries/", data),
  createIncident: (entryId, data = {}) => api.post(`/api/dutyrooms/entries/${entryId}/create-incident/`, data),
};

export const notificationService = {
  list: (params) => api.get("/api/notifications/", { params }),
  markRead: (id) => api.post(`/api/notifications/${id}/mark_read/`),
  markAllRead: () => api.post("/api/notifications/mark_all_read/"),
  delete: (id) => api.delete(`/api/notifications/${id}/`),
  deleteAll: () =>
    api
      .get("/api/notifications/", { params: { page_size: 200 } })
      .then((res) => {
        const items = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.results)
          ? res.data.results
          : [];
        return Promise.all(items.map((n) => api.delete(`/api/notifications/${n.id}/`)));
      }),
};

export const auditService = {
  list: (params) => api.get("/api/audit/logs/", { params }),
  get: (id) => api.get(`/api/audit/logs/${id}/`),
};

export const morningBriefService = {
  list: (params) => api.get("/api/morning-briefs/", { params }),
  get: (id) => api.get(`/api/morning-briefs/${id}/`),
  create: (data) => api.post("/api/morning-briefs/", data),
  update: (id, data) => api.patch(`/api/morning-briefs/${id}/`, data),
  delete: (id) => api.delete(`/api/morning-briefs/${id}/`),
  submit: (id) => api.post(`/api/morning-briefs/${id}/submit/`),
  publish: (id) => api.post(`/api/morning-briefs/${id}/publish/`),
  addIncidents: (id, data) => api.post(`/api/morning-briefs/${id}/add-incidents/`, data),
  compilerStatus: () => api.get("/api/morning-briefs/compiler-status/"),
  compileFromIncidents: (data) => api.post("/api/morning-briefs/compile-from-incidents/", data),
};

export const formationService = {
  formations: () => api.get("/api/formations/formations/"),
  createFormation: (data) => api.post("/api/formations/formations/", data),
  updateFormation: (id, data) => api.patch(`/api/formations/formations/${id}/`, data),
  deleteFormation: (id) => api.delete(`/api/formations/formations/${id}/`),
  battalions: (params) => api.get("/api/formations/battalions/", { params }),
  createBattalion: (data) => api.post("/api/formations/battalions/", data),
  updateBattalion: (id, data) => api.patch(`/api/formations/battalions/${id}/`, data),
  deleteBattalion: (id) => api.delete(`/api/formations/battalions/${id}/`),
  units: (params) => api.get("/api/formations/units/", { params }),
  createUnit: (data) => api.post("/api/formations/units/", data),
  updateUnit: (id, data) => api.patch(`/api/formations/units/${id}/`, data),
  deleteUnit: (id) => api.delete(`/api/formations/units/${id}/`),
  detachments: (params) => api.get("/api/formations/detachments/", { params }),
  createDetachment: (data) => api.post("/api/formations/detachments/", data),
  updateDetachment: (id, data) => api.patch(`/api/formations/detachments/${id}/`, data),
  deleteDetachment: (id) => api.delete(`/api/formations/detachments/${id}/`),
};

export const userService = {
  list: (params) => api.get("/api/auth/users/", { params }),
  create: (data) => api.post("/api/auth/users/", data),
  update: (id, data) => api.patch(`/api/auth/users/${id}/`, data),
  delete: (id) => api.delete(`/api/auth/users/${id}/`),
};

export const analyticsService = {
  resolution: () => api.get("/api/cases/analytics/"),
};

export const teamService = {
  list: (params) => api.get("/api/cases/investigation-teams/", { params }),
  get: (id) => api.get(`/api/cases/investigation-teams/${id}/`),
  create: (data) => api.post("/api/cases/investigation-teams/", data),
  update: (id, data) => api.patch(`/api/cases/investigation-teams/${id}/`, data),
  delete: (id) => api.delete(`/api/cases/investigation-teams/${id}/`),
  workload: () => api.get("/api/cases/investigation-teams/user-workload/"),
};

export const guardroomService = {
  list: (params) => api.get("/api/guardrooms/guardrooms/", { params }),
  get: (id) => api.get(`/api/guardrooms/guardrooms/${id}/`),
  create: (data) => api.post("/api/guardrooms/guardrooms/", data),
  update: (id, data) => api.patch(`/api/guardrooms/guardrooms/${id}/`, data),
  delete: (id) => api.delete(`/api/guardrooms/guardrooms/${id}/`),
  placementRequests: (params) => api.get("/api/guardrooms/placement-requests/", { params }),
  createPlacementRequest: (data) => api.post("/api/guardrooms/placement-requests/", data),
  approvePlacementRequest: (id, data) => api.post(`/api/guardrooms/placement-requests/${id}/approve/`, data),
  rejectPlacementRequest: (id, data) => api.post(`/api/guardrooms/placement-requests/${id}/reject/`, data),
  bookInPlacementRequest: (id) => api.post(`/api/guardrooms/placement-requests/${id}/book-in/`),
  requestBookOut: (id) => api.post(`/api/guardrooms/placement-requests/${id}/request-book-out/`),
  approveBookOut: (id, data) => api.post(`/api/guardrooms/placement-requests/${id}/approve-book-out/`, data),
  freePlacementRequest: (id, data) => api.post(`/api/guardrooms/placement-requests/${id}/free/`, data),
};
