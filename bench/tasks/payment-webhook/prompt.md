The payment provider will send webhooks to `POST /webhooks/payments` (see `src/payments.ts` for how they are signed). Body:

```json
{ "id": "evt_123", "type": "charge.succeeded", "paymentId": "pay_123", "created": 1762300000 }
```

`type` is `charge.succeeded`, `charge.failed` or `charge.refunded`; `created` is a Unix timestamp. Set the matching order's status to `paid`, `failed` or `refunded`.
