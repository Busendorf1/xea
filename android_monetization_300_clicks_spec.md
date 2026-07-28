# Android Studio Integration Guide: Free 300-Clicks Monetization & 7-Day Inactivity Rule

This document details the Kotlin data classes, API contracts, UI progress views, and business rules for the **Free 300-Clicks Monetization Engine** and **7-Day Inactivity Reset** in the Xea (Paayh) Android Studio native app.

---

## 1. Core Business Rules

1. **No Paid Monetization**: All paid subscriptions (₦28,000 / ₦60,000) are removed. Monetization is 100% free and earned through active engagement.
2. **300 Clicks Goal**: A user must achieve **300 ad interactions** (views, seen, mutuals, or redirects).
3. **Button Visibility**:
   - **Non-Monetized Accounts**: Display **Seen** and **Mutual+** buttons only.
   - **Monetized Accounts**: Display **Seen**, **Mutual+**, and **Earn+** buttons.
4. **7-Day Inactivity Reset Rule**:
   - If a user has no active ad interactions or logins for **7 consecutive days**, their monetization status is revoked and their click progress resets to **0**.
   - Upon returning, they must achieve 300 clicks again.

---

## 2. Kotlin Data Model (`MonetizationStatusResponse.kt`)

```kotlin
package com.xea.app.models

import com.google.gson.annotations.SerializedName

data class MonetizationStatusResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("isMonetized") val isMonetized: Boolean,
    @SerializedName("clicksCount") val clicksCount: Int,
    @SerializedName("clicksRemaining") val clicksRemaining: Int,
    @SerializedName("targetClicks") val targetClicks: Int = 300,
    @SerializedName("daysInactive") val daysInactive: Int,
    @SerializedName("statusMessage") val statusMessage: String?
)
```

---

## 3. Retrofit API Service Interface (`MonetizationApiService.kt`)

```kotlin
package com.xea.app.network

import com.xea.app.models.MonetizationStatusResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.POST

interface MonetizationApiService {
    @GET("/api/monetize")
    suspend fun getMonetizationStatus(): Response<MonetizationStatusResponse>

    @POST("/api/monetize")
    suspend fun incrementClickProgress(): Response<MonetizationStatusResponse>
}
```

---

## 4. UI Progress Bar View & Logic (`MonetizeFragment.kt`)

```kotlin
package com.xea.app.ui.monetize

import android.os.Bundle
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.xea.app.R
import com.xea.app.network.RetrofitInstance
import kotlinx.coroutines.launch

class MonetizeFragment : Fragment(R.layout.fragment_monetize) {

    private lateinit var tvStatus: TextView
    private lateinit var tvClicksProgress: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var tvRemaining: TextView

    override fun onViewCreated(view: View, savedInstanceState: android.os.Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        tvStatus = view.findViewById(R.id.tvStatus)
        tvClicksProgress = view.findViewById(R.id.tvClicksProgress)
        progressBar = view.findViewById(R.id.progressBar)
        tvRemaining = view.findViewById(R.id.tvRemaining)

        fetchMonetizationStatus()
    }

    private fun fetchMonetizationStatus() {
        lifecycleScope.launch {
            try {
                val response = RetrofitInstance.monetizationApi.getMonetizationStatus()
                if (response.isSuccessful && response.body() != null) {
                    val data = response.body()!!
                    updateUI(data.isMonetized, data.clicksCount, data.clicksRemaining)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun updateUI(isMonetized: Boolean, clicksCount: Int, clicksRemaining: Int) {
        if (isMonetized) {
            tvStatus.text = "Monetization Active 🟢"
            tvClicksProgress.text = "300 / 300 Clicks Achieved"
            progressBar.progress = 100
            tvRemaining.text = "Goal Completed! Earn+ feature unlocked."
        } else {
            tvStatus.text = "Monetization Inactive ⏳"
            tvClicksProgress.text = "$clicksCount / 300 Clicks"
            val percent = ((clicksCount.toFloat() / 300f) * 100).toInt()
            progressBar.progress = percent
            tvRemaining.text = "$clicksRemaining clicks remaining to unlock monetization"
        }
    }
}
```

---

## 5. User Profile Badge Integration (`ProfileFragment.kt`)

In the user profile header:

```kotlin
fun bindProfileMonetization(isMonetized: Boolean, clicksCount: Int) {
    if (isMonetized) {
        tvMonetizationBadge.text = "Active Monetized Member 🟢"
        tvMonetizationBadge.setBackgroundResource(R.drawable.bg_badge_active)
    } else {
        tvMonetizationBadge.text = "Monetization Progress: $clicksCount / 300 Clicks"
        tvMonetizationBadge.setBackgroundResource(R.drawable.bg_badge_progress)
    }
}
```
