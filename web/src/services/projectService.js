import { api } from './api'

export const projectService = {
  list: () => api.get('/projects'),
  detail: (id) => api.get(`/projects/${id}`),
  remove: (id) => api.delete(`/projects/${id}`),

  upload: (formData, onProgress) =>
    api.post('/projects/upload', formData, {
      onUploadProgress: (e) => onProgress?.(e),
    }),

  fetchOriginal: (id) => api.get(`/projects/${id}/original`, { responseType: 'arraybuffer' }),
  fetchDesign: (id) => api.get(`/projects/${id}/design.json`),

  createPackage: (id, formData) => api.post(`/projects/${id}/package`, formData),
  packageInfo: (id) => api.get(`/projects/${id}/package`),

  compositeUrl: (id) => `/api/projects/${id}/composite`,
  designUrl: (id) => `/api/projects/${id}/design.json`,
  packageZipUrl: (id) => `/api/projects/${id}/package.zip`,
}
