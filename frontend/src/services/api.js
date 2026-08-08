
import api from "../axiosConfig";

export const offenceService = {
  list: () => api.get("/api/offences/"),
  get: (id) => api.get(`/api/offences/${id}/`),
  create: (data) => api.post("/api/offences/", data),
  update: (id, data) => api.put(`/api/offences/${id}/`, data),
  delete: (id) => api.delete(`/api/offences/${id}/`),
};

export const authService = {
  login: async (service_number, password, otp_code = "") => {
    const payload = { service_number, password };
    if (otp_code) payload.otp_code = otp_code;
    const res = await api.post("/api/auth/login/", payload);
    if (res.data.access) {
      sessionStorage.setItem("access_token", res.data.access);
      sessionStorage.setItem("refresh_token", res.data.refresh);
    }
    return res;
  },
  logout: async () => {
    const res = await api.post("/api/auth/logout/");
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
    return res;
  },
  me: () => api.get("/api/auth/me/"),
  changePassword: async (data) => {
    const res = await api.post("/api/auth/change-password/", data);
    if (res.data.access) {
      sessionStorage.setItem("access_token", res.data.access);
      sessionStorage.setItem("refresh_token", res.data.refresh);
    }
    return res;
  },
  mfaSetup: () => api.get("/api/auth/mfa/setup/"),
  mfaVerify: (data) => api.post("/api/auth/mfa/verify/", data),
};

export const caseService = {
  list: (params) => api.get("/api/cases/", { params }),
  get: (id) => api.get(`/api/cases/${id}/`),
  activity: (id) => api.get(`/api/cases/${id}/activity/`),
  create: (formData) =>
    api.post("/api/cases/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (id, data) =>
    api.patch(`/api/cases/${id}/`, data, data instanceof FormData ? {
      headers: { "Content-Type": "multipart/form-data" },
    } : undefined),
  taskCase: (id, formData) =>
    api.patch(`/api/cases/${id}/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  close: (id, formData) =>
    api.patch(`/api/cases/${id}/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  listCourtHearings: (id) => api.get(`/api/cases/${id}/court-hearings/`),
  addCourtHearing: (id, data) => api.post(`/api/cases/${id}/court-hearings/`, data),
  updateCourtHearing: (id, hearingId, data) => api.patch(`/api/cases/${id}/court-hearings/${hearingId}/`, data),
  deleteCourtHearing: (id, hearingId) => api.delete(`/api/cases/${id}/court-hearings/${hearingId}/`),
  listCourtMilestones: (id) => api.get(`/api/cases/${id}/court-milestones/`),
  addCourtMilestone: (id, data) => api.post(`/api/cases/${id}/court-milestones/`, data),
  updateCourtMilestone: (id, milestoneId, data) => api.patch(`/api/cases/${id}/court-milestones/${milestoneId}/`, data),
  deleteCourtMilestone: (id, milestoneId) => api.delete(`/api/cases/${id}/court-milestones/${milestoneId}/`),
  listCourtMilestoneAttachments: (caseId, milestoneId) =>
    api.get(`/api/cases/${caseId}/court-milestones/${milestoneId}/attachments`),
  uploadCourtMilestoneAttachment: (caseId, milestoneId, formData) =>
    api.post(`/api/cases/${caseId}/court-milestones/${milestoneId}/attachments`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  deleteCourtMilestoneAttachment: (caseId, milestoneId, attId) =>
    api.delete(`/api/cases/${caseId}/court-milestones/${milestoneId}/attachments/${attId}`),
  delete: (id) => api.delete(`/api/cases/${id}/`),
};

export const caseBriefService = {
  upload: (caseId, formData) =>
    api.post(`/api/cases/${caseId}/brief/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (caseId, formData) =>
    api.patch(`/api/cases/${caseId}/brief/`, formData, formData instanceof FormData ? {
      headers: { "Content-Type": "multipart/form-data" },
    } : undefined),
};

export const attachmentService = {
  list: (caseId) => api.get(`/api/cases/${caseId}/attachments/`),
  upload: (caseId, formData) =>
    api.post(`/api/cases/${caseId}/attachments/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  delete: (caseId, attId) => api.delete(`/api/cases/${caseId}/attachments/${attId}/`),
  activity: (caseId) => api.get(`/api/cases/${caseId}/activity/`),
};

export const incidentService = {
  list: (params) => api.get("/api/incidents/", { params }),
  get: (id) => api.get(`/api/incidents/${id}/`),
  create: (data) => api.post("/api/incidents/", data),
  update: (id, data) => api.patch(`/api/incidents/${id}/`, data),
  delete: (id) => api.delete(`/api/incidents/${id}/`),
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

export const morningBriefService = {
  list: (params) => api.get("/api/morning-briefs/", { params }),
  get: (id) => api.get(`/api/morning-briefs/${id}/`),
  create: (data) => api.post("/api/morning-briefs/", data),
  update: (id, data) => api.patch(`/api/morning-briefs/${id}/`, data),
  delete: (id) => api.delete(`/api/morning-briefs/${id}/`),
  submit: (id) => api.post(`/api/morning-briefs/${id}/submit/`),
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
  list: () => api.get("/api/guardrooms/guardrooms/"),
  create: (data) => api.post("/api/guardrooms/guardrooms/", data),
  update: (id, data) => api.patch(`/api/guardrooms/guardrooms/${id}/`, data),
  delete: (id) => api.delete(`/api/guardrooms/guardrooms/${id}/`),
};
