## Make it yours

Your team's choices. The rules above stay the same.

- **API collection:** every new or changed endpoint goes into `postman/*.postman_collection.json` in
  the same change: method, URL with `{{baseUrl}}`, an example body, in the shape of the existing requests.
- **Error format:** `{ "error": { "code", "message" } }`.
- **Someone else's resource:** 404 (don't reveal it exists).
