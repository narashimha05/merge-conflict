// DodoPay Configuration
const DODOPAY_CONFIG = {
  // Get these from https://dashboard.dodopayments.com
  businessId: "bus_f3uPb5vOGiIgOKUKZ6xzV",

  // Product ID for Pro subscription ($10/month)
  // Create this in DodoPay Dashboard -> Products -> Create Product
  productId: "pdt_FODJk7565eFHxZgvfuu3U",

  // Success URL for redirect after payment
  successUrl: "payment-success.html",

  // DodoPay Checkout base URL (Production - Live Mode)
  checkoutUrl: "https://checkout.dodopayments.com/buy",
};
