# Team conventions: down migration next to the up one, new endpoints in the Postman collection.
mkdir -p migrations/down && cp "$(dirname "${BASH_SOURCE[0]}")"/down/*.sql migrations/down/
f=postman/shop-api.postman_collection.json
jq --indent 2 '.item += [{"name":"Set product discount","request":{"method":"PATCH","header":[{"key":"Content-Type","value":"application/json"}],"body":{"mode":"raw","raw":"{\"discountPercent\": 20}"},"url":"{{baseUrl}}/products/1"}}]' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
