document.getElementById("upgrade-btn").addEventListener("click", async () => {
  try {
    // Get current user
    const { user } = await chrome.storage.local.get(["user"]);

    if (!user || !user.email) {
      alert("Please sign in first to upgrade to Pro.");
      return;
    }

    // Build DodoPay Static Payment Link with redirect_url
    const redirectUrl = chrome.runtime.getURL(DODOPAY_CONFIG.successUrl);

    const checkoutParams = new URLSearchParams({
      quantity: "1",
      redirect_url: redirectUrl,
      customer_email: user.email,
      customer_name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
    });

    // Add metadata for user tracking
    checkoutParams.append("metadata[user_id]", user.id);

    // Build full checkout URL: /buy/{productId}?params
    const checkoutUrl = `${DODOPAY_CONFIG.checkoutUrl}/${
      DODOPAY_CONFIG.productId
    }?${checkoutParams.toString()}`;

    console.log("Redirect URL:", redirectUrl);
    console.log("Opening checkout:", checkoutUrl);

    // Open checkout in new tab
    chrome.tabs.create({
      url: checkoutUrl,
      active: true,
    });
  } catch (error) {
    console.error("Error initiating payment:", error);
    alert("Failed to start payment process. Please try again.");
  }
});

document.getElementById("close-btn").addEventListener("click", () => {
  window.close();
});
