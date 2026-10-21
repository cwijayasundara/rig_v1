# Feature: a shopper buys tea

entry: src/shop.js
entry: src/server.js
reached by: GET /products, POST /cart, POST /checkout over HTTP (npm start)
end state: the checkout total equals quantity times price; the cart is not empty before it
side effects: none
