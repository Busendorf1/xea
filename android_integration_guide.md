# Android Studio Mobile Integration Guide: Attention Economy Bidding System

This document outlines the Kotlin code structures, API contracts, and UI logic for implementing the **Attention Economy Bidding System** and **Selective Ad Badges** in the Xea (Paayh) Android Studio native app.

---

## 1. Ad Data Model Update (`Ad.kt`)

Update your Kotlin data class representing an Ad model in the Android app:

```kotlin
package com.xea.app.models

import com.google.gson.annotations.SerializedName

data class Ad(
    @SerializedName("id") val id: String,
    @SerializedName("ad_type") val adType: String?,
    @SerializedName("industry") val industry: Any?,
    @SerializedName("ad_content") val adContent: String,
    @SerializedName("ad_media") val adMedia: String?,
    @SerializedName("impressions") val impressions: Int,
    @SerializedName("cost_per_impression") val costPerImpression: Double?,
    @SerializedName("is_bidded") val isBidded: Boolean = false,
    @SerializedName("bid_price") val bidPrice: Double? = null,
    @SerializedName("user_email") val userEmail: String?,
    @SerializedName("created_at") val createdAt: String?
)
```

---

## 2. Top-Right Sensitive Category Badge Helper (`AdBadgeHelper.kt`)

Per platform policy, only sensitive ad categories (**Politics** and **Religion**) render specialized top-right labels. All other categories render the standard `"Ad"` label.

```kotlin
package com.xea.app.utils

object AdBadgeHelper {
    /**
     * Returns "Politics Ad" for politics, "Religious Ad" for religion,
     * and "Ad" for all other categories.
     */
    fun getAdBadgeText(adType: String?, industry: Any?): String {
        val category = (adType ?: parseIndustryString(industry) ?: "").lowercase().trim()
        return when (category) {
            "politics" -> "Politics Ad"
            "religion" -> "Religious Ad"
            else -> "Ad"
        }
    }

    private fun parseIndustryString(industry: Any?): String? {
        return when (industry) {
            is String -> industry
            is List<*> -> industry.firstOrNull()?.toString()
            else -> null
        }
    }
}
```

### RecyclerView Adapter Usage (`AdViewHolder.kt`):
```kotlin
class AdViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
    private val tvSponsorLabel: TextView = itemView.findViewById(R.id.tvSponsorLabel)

    fun bind(ad: Ad) {
        // Set dynamic top-right badge text
        tvSponsorLabel.text = AdBadgeHelper.getAdBadgeText(ad.adType, ad.industry)
        
        // Render rest of ad content...
    }
}
```

---

## 3. Real-Time Bloomberg Market Rates API (`MarketRatesRepository.kt`)

Fetch live attention rates for the Bloomberg market ticker during ad creation:

```kotlin
package com.xea.app.repository

import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.GET

data class MarketRate(
    @SerializedName("floorPrice") val floorPrice: Double,
    @SerializedName("highestBid") val highestBid: Double,
    @SerializedName("totalBids") val totalBids: Long
)

data class MarketRatesResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("timestamp") val timestamp: Long,
    @SerializedName("marketRates") val marketRates: Map<String, MarketRate>
)

interface BiddingApiService {
    @GET("/api/bidding/market-rates")
    suspend fun getMarketRates(): Response<MarketRatesResponse>
}
```

---

## 4. Bidded Ad Checkout Request Payload (`AdCheckoutRequest.kt`)

When an advertiser toggles **"Bid for Priority Attention"** ON in the Android checkout screen:

```kotlin
package com.xea.app.models

data class AdDataPayload(
    val id: String,
    val adType: String,
    val impressions: Int,
    val costPerImpression: Double,
    val totalCost: Double,
    val isBidded: Boolean,
    val bidPrice: Double?
)

data class WalletPayRequest(
    val type: String = "ad",
    val amount: Double,
    val metadata: Map<String, Any>
)

// Example construction in ViewModel:
fun createBiddedPaymentPayload(
    adId: String,
    category: String,
    impressions: Int,
    isBidded: Boolean,
    bidPrice: Double,
    floorPrice: Double
): WalletPayRequest {
    val effectiveRate = if (isBidded) bidPrice else floorPrice
    val totalCost = effectiveRate * impressions

    val adDataMap = mapOf(
        "id" to adId,
        "adType" to category,
        "impressions" to impressions,
        "costPerImpression" to effectiveRate,
        "totalCost" to totalCost,
        "isBidded" to isBidded,
        "bidPrice" to if (isBidded) bidPrice else null
    )

    val metadata = mapOf(
        "type" to "ad",
        "adData" to adDataMap
    )

    return WalletPayRequest(
        amount = totalCost,
        metadata = metadata
    )
}
```

---

## 5. Summary of Architecture Benefits for Mobile

1. **Seamless API Parity**: Mobile app calls the exact same `/api/bidding/market-rates`, `/api/feed`, and `/api/payments/wallet-pay` endpoints as Next.js web.
2. **75/25 Priority Feed**: Mobile feed automatically receives bidded ads with priority speed via the backend `get_user_feed` RPC.
3. **Wallet Auto-Credit**: Mobile viewers receive higher payout wallet credits automatically on engagement without needing UI layout modifications.
