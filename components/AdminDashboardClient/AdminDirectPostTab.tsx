"use client";

import React from "react";
import { PlusCircle } from "lucide-react";
import styles from "./page.module.css";

export interface DirectAdFormState {
  adType: string;
  industry: string[];
  interest: string[];
  impressions: number;
  campaignDays: number;
  userFrequencyCap: number;
  country: string;
  state: string;
  gender: string;
  employmentStatus: string;
  adMediaType: string;
  adContent: string;
  actionPhone: string;
  actionWhatsapp: string;
  actionWebsite: string;
  actionEmail: string;
  costPerImpression: number;
  userEmail: string;
}

export interface DirectHighlightFormState {
  title: string;
  content: string;
  interest: string;
  userEmail: string;
}

interface AdminDirectPostTabProps {
  adForm: DirectAdFormState;
  setAdForm: React.Dispatch<React.SetStateAction<DirectAdFormState>>;
  adFormFiles: File[];
  setAdFormFiles: React.Dispatch<React.SetStateAction<File[]>>;
  highlightForm: DirectHighlightFormState;
  setHighlightForm: React.Dispatch<React.SetStateAction<DirectHighlightFormState>>;
  highlightFormFile: File | null;
  setHighlightFormFile: (file: File | null) => void;
  industriesList: string[];
  interestsList: string[];
  toggleIndustryFormSelection: (item: string) => void;
  toggleInterestFormSelection: (item: string) => void;
  handlePostAdDirect: (e: React.FormEvent) => void;
  handlePostHighlightDirect: (e: React.FormEvent) => void;
  uploading: boolean;
}

export default function AdminDirectPostTab({
  adForm,
  setAdForm,
  adFormFiles,
  setAdFormFiles,
  highlightForm,
  setHighlightForm,
  highlightFormFile,
  setHighlightFormFile,
  industriesList,
  interestsList,
  toggleIndustryFormSelection,
  toggleInterestFormSelection,
  handlePostAdDirect,
  handlePostHighlightDirect,
  uploading,
}: AdminDirectPostTabProps) {
  return (
    <div className={styles.adminCls_54}>
      {/* Direct Ad Form */}
      <form onSubmit={handlePostAdDirect} className={`${styles.form} ${styles.adminCls_55}`}>
        <h2 className={styles.adminCls_56}>
          <span>Create Approved Campaign</span>
        </h2>
        <p className={styles.adminCls_57}>Publish approved campaigns directly to the feed.</p>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Publisher Email</label>
          <input
            type="email"
            required
            value={adForm.userEmail}
            onChange={(e) => setAdForm({ ...adForm, userEmail: e.target.value })}
            className={styles.inputField}
          />
        </div>

        <div className={styles.gridTwoCol}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Ad Category Type</label>
            <select
              value={adForm.adType}
              onChange={(e) => setAdForm({ ...adForm, adType: e.target.value })}
              className={styles.selectField}
            >
              <option value="business">Business</option>
              <option value="individual">Individual</option>
              <option value="politics">Politics</option>
              <option value="religion">Religion</option>
              <option value="government">Government</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Media Type</label>
            <select
              value={adForm.adMediaType}
              onChange={(e) => {
                setAdForm({ ...adForm, adMediaType: e.target.value });
                setAdFormFiles([]);
              }}
              className={styles.selectField}
            >
              <option value="text">Text Only</option>
              <option value="image">Image(s) (Up to 4)</option>
              <option value="video">Video Only (Max 1)</option>
              <option value="mixed">Mixed (Up to 3 Images + 1 Video)</option>
            </select>
          </div>
        </div>

        {adForm.adMediaType !== "text" && (
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Select Files</label>
            <input
              type="file"
              required
              multiple={adForm.adMediaType !== "video"}
              accept={
                adForm.adMediaType === "video"
                  ? "video/*"
                  : adForm.adMediaType === "image"
                  ? "image/*"
                  : "image/*,video/*"
              }
              onChange={async (e) => {
                const files = e.target.files;
                if (!files) return;
                const fileArray = Array.from(files);

                // Validation
                const images = fileArray.filter((f) => f.type.startsWith("image/"));
                const videos = fileArray.filter((f) => f.type.startsWith("video/"));

                if (adForm.adMediaType === "image") {
                  if (videos.length > 0) {
                    alert("Only images are allowed for this type.");
                    e.target.value = "";
                    return;
                  }
                  if (images.length > 4) {
                    alert("You can select up to 4 images only.");
                    e.target.value = "";
                    return;
                  }
                } else if (adForm.adMediaType === "video") {
                  if (images.length > 0) {
                    alert("Only videos are allowed for this type.");
                    e.target.value = "";
                    return;
                  }
                  if (videos.length > 1) {
                    alert("You can select only 1 video.");
                    e.target.value = "";
                    return;
                  }
                } else if (adForm.adMediaType === "mixed") {
                  if (videos.length > 1) {
                    alert("You can select at most 1 video.");
                    e.target.value = "";
                    return;
                  }
                  if (images.length > 3) {
                    alert("You can select at most 3 images.");
                    e.target.value = "";
                    return;
                  }
                  if (images.length + videos.length > 4) {
                    alert("Total number of files cannot exceed 4.");
                    e.target.value = "";
                    return;
                  }
                }

                setAdFormFiles(fileArray);
              }}
              className={styles.adminCls_58}
            />
            {adFormFiles.length > 0 && (
              <div className={styles.adminCls_59}>
                Selected: {adFormFiles.map((f) => f.name).join(", ")}
              </div>
            )}
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Targeting Industry (Select multiple)</label>
          <div className={styles.optionsGrid}>
            {industriesList.map((ind) => (
              <label key={ind} className={styles.optionLabel}>
                <input
                  type="checkbox"
                  checked={adForm.industry.includes(ind)}
                  onChange={() => toggleIndustryFormSelection(ind)}
                />
                <span>{ind}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Targeting Interests (Select multiple)</label>
          <div className={styles.optionsGrid}>
            {interestsList.map((int) => (
              <label key={int} className={styles.optionLabel}>
                <input
                  type="checkbox"
                  checked={adForm.interest.includes(int)}
                  onChange={() => toggleInterestFormSelection(int)}
                />
                <span>{int}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.gridTwoCol}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Target Impressions</label>
            <input
              type="number"
              required
              min="100"
              value={adForm.impressions}
              onChange={(e) => setAdForm({ ...adForm, impressions: parseInt(e.target.value) || 0 })}
              className={styles.inputField}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Campaign Days</label>
            <input
              type="number"
              required
              min="1"
              value={adForm.campaignDays}
              onChange={(e) => setAdForm({ ...adForm, campaignDays: parseInt(e.target.value) || 1 })}
              className={styles.inputField}
            />
          </div>
        </div>

        <div className={styles.gridTwoCol}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Frequency Cap (Views per User)</label>
            <select
              value={adForm.userFrequencyCap}
              onChange={(e) => setAdForm({ ...adForm, userFrequencyCap: parseInt(e.target.value) || 1 })}
              className={styles.selectField}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                <option key={val} value={val}>
                  {val} view(s)
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Cost per Impression (₦)</label>
            <input type="number" disabled value="0" className={`${styles.inputField} ${styles.adminCls_60}`} />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Ad content text (No links allowed)</label>
          <textarea
            required
            placeholder="Write ad description text..."
            value={adForm.adContent}
            onChange={(e) => setAdForm({ ...adForm, adContent: e.target.value })}
            className={styles.textareaField}
          />
        </div>

        <div className={styles.gridTwoCol}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Action Phone Link</label>
            <input
              type="text"
              placeholder="+234..."
              value={adForm.actionPhone}
              onChange={(e) => setAdForm({ ...adForm, actionPhone: e.target.value })}
              className={styles.inputField}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Action Whatsapp Link</label>
            <input
              type="text"
              placeholder="+234..."
              value={adForm.actionWhatsapp}
              onChange={(e) => setAdForm({ ...adForm, actionWhatsapp: e.target.value })}
              className={styles.inputField}
            />
          </div>
        </div>

        <div className={styles.gridTwoCol}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Action Website Link</label>
            <input
              type="text"
              placeholder="https://..."
              value={adForm.actionWebsite}
              onChange={(e) => setAdForm({ ...adForm, actionWebsite: e.target.value })}
              className={styles.inputField}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Action Email Link</label>
            <input
              type="email"
              placeholder="business@paayh.com"
              value={adForm.actionEmail}
              onChange={(e) => setAdForm({ ...adForm, actionEmail: e.target.value })}
              className={styles.inputField}
            />
          </div>
        </div>

        <button type="submit" disabled={uploading} className={styles.btnSubmit}>
          {uploading ? "Uploading media and publishing..." : "Publish Ad Directly"}
        </button>
      </form>

      {/* Direct Highlight Form */}
      <form onSubmit={handlePostHighlightDirect} className={`${styles.form} ${styles.adminCls_61}`}>
        <h2 className={styles.adminCls_56}>
          <span>Create Approved Highlight</span>
        </h2>
        <p className={styles.adminCls_57}>Publish approved highlights directly to the feed.</p>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Publisher Email</label>
          <input
            type="email"
            required
            value={highlightForm.userEmail}
            onChange={(e) => setHighlightForm({ ...highlightForm, userEmail: e.target.value })}
            className={styles.inputField}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Highlight Title</label>
          <input
            type="text"
            required
            placeholder="Enter highlight title..."
            value={highlightForm.title}
            onChange={(e) => setHighlightForm({ ...highlightForm, title: e.target.value })}
            className={styles.inputField}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Category Interest</label>
          <select
            value={highlightForm.interest}
            onChange={(e) => setHighlightForm({ ...highlightForm, interest: e.target.value })}
            className={styles.selectField}
          >
            {interestsList.map((int) => (
              <option key={int} value={int}>
                {int}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Select Cover Image</label>
          <input
            type="file"
            required
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setHighlightFormFile(file);
            }}
            className={styles.adminCls_58}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Highlight Details</label>
          <textarea
            required
            placeholder="Write details content..."
            value={highlightForm.content}
            onChange={(e) => setHighlightForm({ ...highlightForm, content: e.target.value })}
            className={styles.textareaField}
          />
        </div>

        <button type="submit" disabled={uploading} className={styles.btnSubmit}>
          {uploading ? "Uploading cover image and publishing..." : "Publish Highlight Directly"}
        </button>
      </form>
    </div>
  );
}
