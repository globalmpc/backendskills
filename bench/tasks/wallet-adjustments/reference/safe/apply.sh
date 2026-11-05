# Team conventions: down migration next to the up one, new endpoints in the Postman collection.
mkdir -p migrations/down && cp "$(dirname "${BASH_SOURCE[0]}")"/down/*.sql migrations/down/
f=postman/shop-api.postman_collection.json
jq --indent 2 '.item += [{"name":"Adjust wallet","request":{"method":"POST","header":[{"key":"Content-Type","value":"application/json"}],"body":{"mode":"raw","raw":"{\"amountCents\": 500, \"reason\": \"goodwill\"}"},"url":"{{baseUrl}}/wallets/2/adjustments"}}]' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
