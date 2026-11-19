import ipaddress

from django.conf import settings


def get_client_ip(request):
    remote_addr = request.META.get("REMOTE_ADDR")
    if not remote_addr:
        return None

    try:
        remote_ip = ipaddress.ip_address(remote_addr.strip())
    except ValueError:
        return None

    trusted_networks = getattr(settings, "TRUSTED_PROXY_NETWORKS", ())
    if not any(remote_ip in network for network in trusted_networks):
        return str(remote_ip)

    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if not forwarded_for:
        return str(remote_ip)

    forwarded_chain = []
    for value in forwarded_for.split(","):
        try:
            forwarded_chain.append(ipaddress.ip_address(value.strip()))
        except ValueError:
            return str(remote_ip)

    forwarded_chain.append(remote_ip)
    while len(forwarded_chain) > 1 and any(
        forwarded_chain[-1] in network for network in trusted_networks
    ):
        forwarded_chain.pop()

    return str(forwarded_chain[-1])
