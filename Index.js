var _productSku = "1";
var _productCatalog = "IntegrationTask"; 
var _subscriptionPlanId = 2425; 
var _merchantPublicKey = "qTmCPw7W5W2S57gL0kwM";
var _merchantPrivateKey = "cv6kWabwxYRUSPSia1nj";
var _operatorCode = "";
var _subscriptionContractId = "";


// Mapping country to operators
const operators = {
  egypt: [
    { name: "Vodafone", value: "60202" },
    { name: "Orange", value: "60201" },
    
  ],

};

function formatUtcDate() {
    var d = new Date();
    var yyyy = d.getUTCFullYear();
    var mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    var dd = String(d.getUTCDate()).padStart(2, "0");
    var HH = String(d.getUTCHours()).padStart(2, "0");
    var MM = String(d.getUTCMinutes()).padStart(2, "0");
    var SS = String(d.getUTCSeconds()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd + " " + HH + ":" + MM + ":" + SS + "Z";// Format: YYYY-MM-DD hh:mm:ssZ (with a space)
  }
  
  function bufferToHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = Array.from(bytes)
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
    return hex;
  }
  
  async function hmacSha256Hex(secret, message) {
    var enc = new TextEncoder();
    var keyData = enc.encode(secret);
    var cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: { name: "SHA-256" } },
      false,
      ["sign"]
    );
    var sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
    return bufferToHex(sig);
  }

  function injectScript(script) {
  
    var TPayScript = document.createElement("script");
    TPayScript.setAttribute("src", script);
    document.head.appendChild(TPayScript);
    TPayScript.onload = function () {
      onScriptLoad();
      console.log("enriched:", window.TPay.HeaderEnrichment.enriched());
    };
    TPayScript.onerror = () => {
      onScriptError();
      console.log("error loading script");
    };
  }

  async function buildTPayScriptUrl(generate) {
    var base = "https://lookup.tpay.me/idxml.ashx/v2/js";
    var date = generate.date; // formatted as YYYY-MM-DD hh:mm:ssZ
    var lang = generate.lang || "en";
    var merchantPublicKey = generate.merchantPublicKey;
    var merchantPrivateKey = generate.merchantPrivateKey;
  
    // Message for signature: date + lang 
    var message = date + (lang || "");
    var hmacHex = await hmacSha256Hex(merchantPrivateKey, message);
    var digest = merchantPublicKey + ":" + hmacHex;
  
    var url =
      base +
      "?date=" +
      encodeURIComponent(date) +
      "&lang=" +
      encodeURIComponent(lang) +
      "&digest=" +
      encodeURIComponent(digest);
    console.log(url);
    return url;
  }

  async function initTPayScript(lang) {
    try {
      var date = formatUtcDate();
      var url = await buildTPayScriptUrl({
        date: date,
        lang: lang || "en",
        merchantPublicKey: _merchantPublicKey,
        merchantPrivateKey: _merchantPrivateKey,
      });
      injectScript(url);
    } catch (e) {
      console.error("Failed to init TPAY script:", e);
      onScriptError();
    }
  }

  initTPayScript("en");

  function updateOperators() {
    const countrySelect = document.getElementById("country");
    const operatorSelect = document.getElementById("operator");
    const selectedCountry = countrySelect.value;
  
    operatorSelect.innerHTML = '<option value="">Select an operator</option>'; 
  
    if (operators[selectedCountry]) {
      operators[selectedCountry].forEach((operator) => {
        const option = document.createElement("option");
        option.value = operator.value;
        option.text = operator.name;
        operatorSelect.appendChild(option);
      });
    }
  }

  async function confirmationCallback(status, refCode, contract) {
    if (status) {
      if (refCode) {
        console.log("Subscription verified successfully.");
        console.log("create service access and send welcome SMS to the user");
        console.log("Reference Code:" + refCode);
        console.log("Contract Details below:");
        console.table(contract);
      } else {
        if (contract.operationStatusCode == 0) {
          console.log(
            "Subscription contract created by TPAY, pending verification by you"
          );
          console.log("Redirect user to pinCode page.");
          console.log("Call the verification API in your server side.");
          console.log("Contract Details below:");
          console.table(contract);
          _subscriptionContractId = contract.subscriptionContractId;
          _transactionId = contract.transactionId;
          console.log(_subscriptionContractId);
          goToPinView();
        } else {
          console.log("subscription verification failed");
          console.log("Contract Details below:");
          console.table(contract);
          var errorMsg = contract.errorMessage;
          if (errorMsg === "This user already subscribed to the given product") {
            console.log(
              "show user a message that he is already subscribed and Redirect user to login page."
            );
          }
          alert(errorMsg);
        }
      }
    } else {
      console.log("there's an operational error in the confirm function process");
      console.log(status);
      console.log(refCode);
      console.table(contract);
    }
  }
  
  function callConfirm() {
    var subscriptionInfo = {
      subscriptionPlanId: _subscriptionPlanId,
      productCatalog: _productCatalog,
      productSku: _productSku,
      customerAccountNumber: "sandbox-test", 
      msisdn: TPay.HeaderEnrichment.msisdn(),
      operatorCode: TPay.HeaderEnrichment.operatorCode(),
      merchantTemplateKey: "integrationTask",
    };
    if (!window.TPay.HeaderEnrichment.enriched()) {
      subscriptionInfo.msisdn = document.getElementById("msisdn").value; 
      subscriptionInfo.operatorCode = _operatorCode; 
    }
    console.table(subscriptionInfo);
    TPay.HeaderEnrichment.confirm(subscriptionInfo, confirmationCallback);
  }
function goToPinView() {
  document.getElementById("form-view").style.display = "none";
  document.getElementById("pin-view").style.display = "block";
}

async function submitPin() {
    try {
      const pinCode = document.getElementById("pin-code").value;
  
      
      const message =
        _subscriptionContractId.toString() +
        pinCode +
        (_transactionId || "") +
        "true";
      const sigHex = await hmacSha256Hex(_merchantPrivateKey, message);
      const signature = _merchantPublicKey + ":" + sigHex;
  
      
      const verifyResp = await fetch(
        "http://live.tpay.me/api/TPAYSubscription.svc/Json/VerifySubscriptionContract",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signature: signature,
            subscriptionContractId: _subscriptionContractId,
            pinCode: pinCode,
            transactionId: _transactionId,
            charge: true,
          }),
        }
      );
      const verifyData = await verifyResp.json();
      console.log("Verify response:", verifyData);
  
      if (verifyData.operationStatusCode === 0) {
        console.log("Subscription verified successfully!");
  
        // (SendFreeMTMessage)
        const welcomeMessage = "Welcome! Your subscription is active.";
        const operatorCode = _operatorCode;
        const messageBody = welcomeMessage;
        const smsMsg = messageBody + operatorCode + _subscriptionContractId;
        const smsSigHex = await hmacSha256Hex(_merchantPrivateKey, smsMsg);
        const smsSignature = _merchantPublicKey + ":" + smsSigHex;
  
        const smsResp = await fetch(
          "http://live.tpay.me/api/TPAY.svc/json/SendFreeMTMessage",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              signature: smsSignature,
              messageBody: messageBody,
              operatorCode: operatorCode,
              subscriptionContractId: _subscriptionContractId,
            }),
          }
        );
        const smsData = await smsResp.json();
        console.log("SendFreeMTMessage response:", smsData);
  
        // (CancelSubscriptionContract)
        const cancelMsg = _subscriptionContractId.toString();
        const cancelSigHex = await hmacSha256Hex(_merchantPrivateKey, cancelMsg);
        const cancelSignature = _merchantPublicKey + ":" + cancelSigHex;
  
        const cancelResp = await fetch(
          "http://live.tpay.me/api/TPAYSubscription.svc/Json/CancelSubscriptionContractRequest",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              signature: cancelSignature,
              subscriptionContractId: _subscriptionContractId,
            }),
          }
        );
        const cancelData = await cancelResp.json();
        console.log("CancelSubscriptionContract response:", cancelData);
  
        alert(
          "Subscription verified, welcome SMS sent, and subscription canceled."
        );
        restartProcess();
      } else {
        alert("Subscription verification failed: " + verifyData.errorMessage);
      }
    } catch (err) {
      console.error("Error in submitPin:", err);
      alert("Something went wrong during subscription verification.");
    }
  }

  function setOperator() {
    const operatorSelect = document.getElementById("operator");
    const selectedOperator = operatorSelect.value;
    _operatorCode = selectedOperator;
    if (selectedOperator) {
      window.TPay.HeaderEnrichment.init({ operatorCode: selectedOperator });
    }
  }

  function onScriptLoad() {
    document.getElementById("loader").style.display = "none";
    document.getElementById("form-view").style.display = "block";
  }

  function onScriptError() {
    document.getElementById("loader-spinner").style.display = "none";
    document.getElementById("loader-msg").innerText =
      "Error loading script. You can proceed by selecting operator and entering your number.";
    document.getElementById("loader-msg").style.color = "#b91c1c";
    // Show the form so user can proceed manually
    document.getElementById("loader").style.display = "none";
    document.getElementById("form-view").style.display = "block";
  }