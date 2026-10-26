# Requirements (generated from prd.md by rig: never edit)

- AC-1.1 [rule] prd.md:19 "WHEN a product is added with a stock count THE SYSTEM SHALL report that count from get and list"
- AC-2.1 [rule] prd.md:25 "WHEN more than the stock is added to the cart THE SYSTEM SHALL refuse it with a message that names the SKU"
- AC-3.1 [rule] prd.md:31 "WHEN a client sends GET /stock/<sku> THE SYSTEM SHALL answer with the stock of that product"
- NFR-1 [rule] prd.md:41 "NFR-1 | operability | every refusal names the SKU | 100% of messages | unit"
