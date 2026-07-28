# Android Studio Mobile Integration Guide: Account Deactivation Engine

This document details the Kotlin Retrofit interface, API contract, and UI flow for account deactivation in the Xea (Paayh) Android Studio native app.

---

## 1. Deactivation API Endpoint Specification

- **Endpoint**: `POST /api/profile/deactivate`
- **Authentication**: Requires Auth0 / session Bearer Token in `Authorization` header.
- **Behavior**:
  - Atomically deletes user campaigns (`adds`, `addsactive`, `bidded_ads`), news highlights (`news`, `newsactive`), payments, notifications, impressions, and user profile record.
  - Clears Redis profile and feed caches.

---

## 2. Kotlin Retrofit API Interface (`DeactivateApiService.kt`)

```kotlin
package com.xea.app.network

import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.POST

data class DeactivateResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String?
)

interface DeactivateApiService {
    @POST("/api/profile/deactivate")
    suspend fun deactivateAccount(): Response<DeactivateResponse>
}
```

---

## 3. Deactivate Activity / Fragment Logic (`DeactivateActivity.kt`)

```kotlin
package com.xea.app.ui.deactivate

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.xea.app.R
import com.xea.app.network.RetrofitInstance
import com.xea.app.ui.login.LoginActivity
import kotlinx.coroutines.launch

class DeactivateActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_deactivate)

        val btnDeleteAccount = findViewById<Button>(R.id.btnDeleteAccount)
        val btnCancel = findViewById<Button>(R.id.btnCancel)

        btnCancel.setOnClickListener { finish() }

        btnDeleteAccount.setOnClickListener {
            showConfirmationDialog()
        }
    }

    private fun showConfirmationDialog() {
        AlertDialog.Builder(this)
            .setTitle("Permanently Delete Account?")
            .setMessage("This action is irreversible and will permanently delete all your active ads, campaigns, monetization progress, and user data.")
            .setPositiveButton("Yes, Delete My Account") { _, _ ->
                executeAccountDeactivation()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun executeAccountDeactivation() {
        lifecycleScope.launch {
            try {
                val response = RetrofitInstance.deactivateApi.deactivateAccount()
                if (response.isSuccessful && response.body()?.success == true) {
                    Toast.makeText(this@DeactivateActivity, "Account permanently deleted.", Toast.LENGTH_LONG).show()
                    
                    // Clear local preferences & token storage
                    getSharedPreferences("xea_prefs", MODE_PRIVATE).edit().clear().apply()

                    // Redirect user to LoginActivity
                    val intent = Intent(this@DeactivateActivity, LoginActivity::class.java)
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                    startActivity(intent)
                    finish()
                } else {
                    Toast.makeText(this@DeactivateActivity, "Failed to deactivate account: ${response.message()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@DeactivateActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
```
