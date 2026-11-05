# Team conventions: down migration next to the up one, new endpoints in the Postman collection.
mkdir -p migrations/down && cp "$(dirname "${BASH_SOURCE[0]}")"/down/*.sql migrations/down/
f=postman/shop-api.postman_collection.json
jq --indent 2 '.item += [{"name":"Review a product","request":{"method":"POST","header":[{"key":"Content-Type","value":"application/json"}],"body":{"mode":"raw","raw":"{\"rating\": 5, \"body\": \"Great\"}"},"url":"{{baseUrl}}/products/1/reviews"}},{"name":"List product reviews","request":{"method":"GET","url":"{{baseUrl}}/products/1/reviews"}}]' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
