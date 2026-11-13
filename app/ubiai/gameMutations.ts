import type { Mutation, PageState } from './gameTypes';

export const initialPage: PageState = {
  "cart": {
    "visible": true,
    "label": "Add to Cart",
    "bg": "#111111",
    "fg": "#ffffff",
    "border": "1px solid #111111",
    "hoverBg": "#333333",
    "focusRing": "2px solid #9e9e9e",
    "fontFamily": "Inter, system-ui, sans-serif",
    "fontSize": "15px",
    "fontWeight": 500,
    "letterSpacing": "0",
    "radius": "6px",
    "padding": "10px 18px",
    "textTransform": "none",
    "scale": 1
  },
  "cancel": {
    "visible": true,
    "label": "Cancel",
    "bg": "#111111",
    "fg": "#ffffff",
    "border": "1px solid #111111",
    "hoverBg": "#333333",
    "focusRing": "2px solid #9e9e9e",
    "fontFamily": "Inter, system-ui, sans-serif",
    "fontSize": "15px",
    "fontWeight": 500,
    "letterSpacing": "0",
    "radius": "6px",
    "padding": "10px 18px",
    "textTransform": "none",
    "scale": 1
  },
  "elements": []
};

export const mutations: Mutation[] = [
  {
    "id": "none",
    "describes": "No visual change."
  },
  {
    "id": "reset_baseline",
    "describes": "Restore the original page: both buttons back to the black baseline, every auxiliary element removed.",
    "reset": true
  },
  {
    "id": "all_blue",
    "describes": "Both buttons turn blue: the shared button color value was changed, so Cancel went blue with Add to Cart.",
    "cart": {
      "bg": "#1565c0",
      "fg": "#ffffff",
      "border": "1px solid #1565c0",
      "hoverBg": "#0d47a1",
      "focusRing": "2px solid #64b5f6"
    },
    "cancel": {
      "bg": "#1565c0",
      "fg": "#ffffff",
      "border": "1px solid #1565c0",
      "hoverBg": "#0d47a1",
      "focusRing": "2px solid #64b5f6"
    }
  },
  {
    "id": "restore_cancel",
    "describes": "Cancel returns to black; Add to Cart is still blue.",
    "cancel": {
      "bg": "#111111",
      "fg": "#ffffff",
      "border": "1px solid #111111",
      "hoverBg": "#333333",
      "focusRing": "2px solid #9e9e9e"
    }
  },
  {
    "id": "gradient_five",
    "describes": "Add to Cart becomes a shallow left-to-right gradient across five blues, cyan at the left edge to navy at the right; Cancel stays black.",
    "cart": {
      "bg": "linear-gradient(90deg, #3fd3e0 0%, #16b8c4 25%, #1ea0d8 50%, #1976d2 75%, #0d47a1 100%)",
      "fg": "#ffffff",
      "border": "1px solid #1976d2",
      "hoverBg": "linear-gradient(90deg, #3fd3e0 0%, #16b8c4 25%, #1ea0d8 50%, #1976d2 75%, #0d47a1 100%)",
      "focusRing": "2px solid #64b5f6"
    }
  },
  {
    "id": "gradient_left_third",
    "describes": "The gradient narrows to its left third: Add to Cart now runs from light cyan to cyan only.",
    "cart": {
      "bg": "linear-gradient(90deg, #3fd3e0 0%, #2cc7d2 50%, #16b8c4 100%)",
      "fg": "#0b2f33",
      "border": "1px solid #16b8c4",
      "hoverBg": "linear-gradient(90deg, #3fd3e0 0%, #2cc7d2 50%, #16b8c4 100%)",
      "focusRing": "2px solid #7fe0e8"
    }
  },
  {
    "id": "cart_black_pending",
    "describes": "Add to Cart goes back to plain black; the chosen value is not applied. Cancel stays black.",
    "cart": {
      "bg": "#111111",
      "fg": "#ffffff",
      "border": "1px solid #111111",
      "hoverBg": "#333333",
      "focusRing": "2px solid #9e9e9e"
    }
  },
  {
    "id": "flat_cyan",
    "describes": "Add to Cart is a single flat cyan-leaning blue, #16B8C4, with dark text; Cancel stays as it is.",
    "cart": {
      "bg": "#16B8C4",
      "fg": "#0b2f33",
      "border": "1px solid #16B8C4",
      "hoverBg": "#12a3ae",
      "focusRing": "2px solid #7fe0e8"
    }
  },
  {
    "id": "alpha_doubled",
    "describes": "Both buttons wash out to half strength, as if their opacity had been applied twice: Add to Cart a pale cyan, Cancel a mid grey.",
    "cart": {
      "bg": "#8adce2",
      "fg": "#5d8f94",
      "border": "1px solid #8adce2",
      "hoverBg": "#8adce2",
      "focusRing": "2px solid #c9eef1"
    },
    "cancel": {
      "bg": "#888888",
      "fg": "#d0d0d0",
      "border": "1px solid #888888",
      "hoverBg": "#888888",
      "focusRing": "2px solid #c4c4c4"
    }
  },
  {
    "id": "alpha_reverted",
    "describes": "Both buttons return to full strength: Add to Cart flat cyan, Cancel black.",
    "cart": {
      "bg": "#16B8C4",
      "fg": "#0b2f33",
      "border": "1px solid #16B8C4",
      "hoverBg": "#12a3ae",
      "focusRing": "2px solid #7fe0e8"
    },
    "cancel": {
      "bg": "#111111",
      "fg": "#ffffff",
      "border": "1px solid #111111",
      "hoverBg": "#333333",
      "focusRing": "2px solid #9e9e9e"
    }
  },
  {
    "id": "secondary_broken",
    "describes": "Cancel loses its theme entirely: white background, black text, dashed grey border. Add to Cart is still cyan.",
    "cancel": {
      "bg": "#ffffff",
      "fg": "#111111",
      "border": "1px dashed #9e9e9e",
      "hoverBg": "#f2f2f2",
      "focusRing": "2px solid #9e9e9e"
    }
  },
  {
    "id": "terms_link",
    "describes": "A small grey \u201cTerms of Use\u201d link appears under the buttons.",
    "elements": [
      {
        "id": "terms_link",
        "action": "ADD",
        "kind": "text",
        "placement": "BELOW",
        "text": "Terms of Use",
        "fg": "#6b7280",
        "fontSize": "0.6rem",
        "letterSpacing": "0.04em",
        "align": "center"
      }
    ]
  },
  {
    "id": "terms_removed",
    "describes": "The Terms of Use link disappears; the button is still cyan.",
    "elements": [
      {
        "id": "terms_link",
        "action": "REMOVE"
      }
    ]
  },
  {
    "id": "gray_disabled",
    "describes": "Add to Cart turns flat grey with pale text, the look of a disabled control. Cancel stays black.",
    "cart": {
      "bg": "#9e9e9e",
      "fg": "#f5f5f5",
      "border": "1px solid #9e9e9e",
      "hoverBg": "#9e9e9e",
      "focusRing": "2px solid #bdbdbd"
    }
  },
  {
    "id": "blue_active",
    "describes": "Add to Cart is a standard blue, #2563EB, and looks active again; Cancel is black.",
    "cart": {
      "bg": "#2563EB",
      "fg": "#ffffff",
      "border": "1px solid #2563EB",
      "hoverBg": "#1d4ed8",
      "focusRing": "2px solid #93c5fd"
    }
  },
  {
    "id": "consent_banner",
    "describes": "A dark cookie-consent banner appears above the product: necessary storage only, analytics/marketing/preferences off, Reject all / Manage choices / Accept. Add to Cart is still blue underneath.",
    "elements": [
      {
        "id": "consent_banner",
        "action": "ADD",
        "kind": "panel",
        "placement": "ABOVE",
        "text": "\ud83c\udf6a This site uses necessary storage only. Analytics: off. Marketing: off. Preferences: off. No tracking scripts are loaded.\n[ Reject all ]   [ Manage choices ]   [ Accept ]",
        "bg": "#1f2933",
        "fg": "#ffffff",
        "border": "1px solid #37474f",
        "fontSize": "0.7rem",
        "fontWeight": 400,
        "padding": "16px 18px"
      }
    ]
  }
];
