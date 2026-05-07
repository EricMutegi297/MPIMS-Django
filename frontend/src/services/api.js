
import api from "../axiosConfig";

export const offenceService = {
  list: () => api.get("/api/offences/"),
  get: (id) => api.get(`/api/offences/${id}/`),
  create: (data) => api.post("/api/offences/", data),
  update: (id, data) => api.put(`/api/offences/${id}/`, data),
  delete: (id) => api.delete(`/api/offences/${id}/`),
};

export const authService = {
  login: (service_number, password) =>
    api.post("/api/auth/login/", { service_number, password }).then((res) => {
      sessionStorage.setItem("access_token", res.data.access);
      sessionStorage.setItem("refresh_token", res.data.refresh);
      return res;
    }),
  logout: () => {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
    return api.post("/api/auth/logout/");
  },
  me: () => api.get("/api/auth/me/"),
  changePassword: (data) =>
    api.post("/api/auth/change-password/", data).then((res) => {
      if (res.data.access) {
        sessionStorage.setItem("access_token", res.data.access);
        sessionStorage.setItem("refresh_token", res.data.refresh);
      }
      return res;
    }),
};

export const caseService = {
  list: (params) => api.get("/api/cases/", { params }),
  get: (id) => api.get(`/api/cases/${id}/`),
  create: (formData) =>
    api.post("/api/cases/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (id, data) => api.patch(`/api/cases/${id}/`, data),
  taskCase: (id, formData) =>
    api.patch(`/api/cases/${id}/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  delete: (id) => api.delete(`/api/cases/${id}/`),
  attachBrief: (id, formData) =>
    api.patch(`/api/cases/${id}/attach_brief/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  forwardBrief: (id, data) => api.post(`/api/cases/${id}/forward_brief/`, data),
  serveCase: (id) => api.post(`/api/cases/${id}/serve_case/`),
};

export const abstractService = {
  list: (caseId) => api.get("/api/cases/abstracts/", { params: { case: caseId } }),
  create: (formData) =>
    api.post("/api/cases/abstracts/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  delete: (id) => api.delete(`/api/cases/abstracts/${id}/`),
};

export const incidentService = {
  list: (params) => api.get("/api/incidents/", { params }),
  get: (id) => api.get(`/api/incidents/${id}/`),
  create: (data) => api.post("/api/incidents/", data),
  update: (id, data) => api.patch(`/api/incidents/${id}/`, data),
  delete: (id) => api.delete(`/api/incidents/${id}/`),
};

export const notificationService = {
  list: () => api.get("/api/notifications/"),
  markRead: (id) => api.post(`/api/notifications/${id}/mark_read/`),
  markAllRead: () => api.post("/api/notifications/mark_all_read/"),
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
  update: (id, data) => api.patch(`/api/auth/users/${id}/`, data),
  delete: (id) => api.delete(`/api/auth/users/${id}/`),
};

export const teamService = {
  list: (params) => api.get("/api/cases/investigation-teams/", { params }),
  get: (id) => api.get(`/api/cases/investigation-teams/${id}/`),
  create: (data) => api.post("/api/cases/investigation-teams/", data),
  update: (id, data) => api.patch(`/api/cases/investigation-teams/${id}/`, data),
  delete: (id) => api.delete(`/api/cases/investigation-teams/${id}/`),
};

export const guardroomService = {
  list: () => api.get("/api/guardrooms/guardrooms/"),
  create: (data) => api.post("/api/guardrooms/guardrooms/", data),
  update: (id, data) => api.patch(`/api/guardrooms/guardrooms/${id}/`, data),
  delete: (id) => api.delete(`/api/guardrooms/guardrooms/${id}/`),
};
