import React, { useEffect, useRef, useState } from "react";

// Sizes chosen to match common, well-performing AdSense display formats.
const PLACEMENT_SIZES = {
  "editor-top": { height: 90, maxWidth: 728 },
  "preview-bottom": { height: 250, maxWidth: 336 },
  "sidebar-footer": { height: 250, maxWidth: 300 },
};

const ADS_ENABLED = import.meta.env.VITE_ADS_ENABLED === "true";
const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT_ID || "";

// A single, reusable ad slot. The whole point of centralizing it here:
// swapping ad providers later, or changing placement rules, means editing
// this one file — nothing in App.jsx needs to know or care how ads work.
//
// Hard rule this component exists to enforce: the app must work identically
// whether an ad loads, fails to load, is blocked, or is disabled in dev.
// Nothing here ever gates or delays the rest of the page.
export default function AdSlot({ placement }) {
  const [failed, setFailed] = useState(false);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!ADS_ENABLED || !ADSENSE_CLIENT || failed || pushedRef.current) return;
    pushedRef.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("AdSlot: ad request failed for placement", placement, e);
      setFailed(true);
    }
  }, [placement, failed]);

  const size = PLACEMENT_SIZES[placement] || PLACEMENT_SIZES["editor-top"];

  if (!ADS_ENABLED) {
    // Dev placeholder (also shown before AdSense approval) — reserves the
    // space so the layout doesn't jump once real ads are switched on, but
    // never resembles a real ad, so it can't be mistaken for one.
    return (
      <div className="no-print" style={{ width: "100%", maxWidth: size.maxWidth, height: size.height, margin: "0 auto", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", fontSize: 11 }}>
        Ad space ({placement})
      </div>
    );
  }

  // If the real ad failed, render nothing — never leave a visibly broken
  // box where an ad should have been.
  if (failed) return null;

  return (
    <div className="no-print" style={{ width: "100%", maxWidth: size.maxWidth, minHeight: size.height, margin: "0 auto" }}>
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "100%", height: size.height }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={placement}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
