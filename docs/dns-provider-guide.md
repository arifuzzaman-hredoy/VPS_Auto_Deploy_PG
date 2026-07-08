# Custom DNS Provider Guide

To add a custom DNS provider, collect from provider API docs:

1. Base API URL
2. Authentication method
3. Zone/domain identifier
4. List records endpoint
5. Create record endpoint
6. Update record endpoint
7. Delete record endpoint
8. Required headers
9. Request body format
10. Response record id/name/value paths

Safety workflow:

```txt
Enter config → Test connection → Dry-run payload → Preview DNS changes → User confirm → Apply records → Recheck DNS
```

Supported auth modes:

- Bearer token
- API key header
- Basic auth
- Query parameter
- Custom header
