from django.urls import path

from .views import (
    ClearanceCertificateView,
    ClearanceCertificateDownloadView,
    ClearanceRequestDecisionView,
    ClearanceRequestListCreateView,
)

urlpatterns = [
    path("requests/", ClearanceRequestListCreateView.as_view(), name="clearance-request-list"),
    path(
        "requests/<int:pk>/approve/",
        ClearanceRequestDecisionView.as_view(),
        {"decision": "approve"},
        name="clearance-request-approve",
    ),
    path(
        "requests/<int:pk>/reject/",
        ClearanceRequestDecisionView.as_view(),
        {"decision": "reject"},
        name="clearance-request-reject",
    ),
    path(
        "requests/<int:pk>/certificate/preview/",
        ClearanceCertificateView.as_view(),
        name="clearance-request-certificate-preview",
    ),
    path(
        "requests/<int:pk>/certificate/",
        ClearanceCertificateDownloadView.as_view(),
        name="clearance-request-certificate",
    ),
]
