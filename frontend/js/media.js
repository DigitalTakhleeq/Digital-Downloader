// Renders normalized analysis results for LinkFetch.
import { formatDuration, formatSize } from "./format.js";
import { els } from "./ui.js";

const VIDEO_OUTPUTS = ["mp4", "mkv", "webm"];
const AUDIO_OUTPUTS = ["mp3", "m4a", "opus"];

const AUDIO_GROUP = "Audio only";
let current = null;

function groupKey(format) {
  return format.type === "audio" ? AUDIO_GROUP : format.resolution ?? "Original file";
}

function parseHeight(res) {
  if (!res || typeof res !== "string") return 0;
  const match = res.match(/^(\d+)p/i);
  return match ? parseInt(match[1], 10) : 0;
}

const QUALITY_NAMES = { 4320: "8K", 2160: "4K", 1440: "2K", 1080: "Full HD", 720: "HD", 480: "SD" };

/** Picks the version that plays everywhere (MP4/H.264) before bigger-but-pickier codecs. */
function compatibility(f) {
  return (f.container === "mp4" ? 2 : 0) + (f.video_codec === "H.264" || !f.video_codec ? 1 : 0);
}

function groupFormats(formats) {
  // Always sort quality from highest resolution down to lowest, with audio at the end
  const sorted = [...formats].sort((a, b) => {
    if (a.type === "video" && b.type === "audio") return -1;
    if (a.type === "audio" && b.type === "video") return 1;
    const hA = parseHeight(a.resolution);
    const hB = parseHeight(b.resolution);
    if (hA !== hB) return hB - hA;
    if (a.has_audio !== b.has_audio) return a.has_audio ? -1 : 1;
    if (compatibility(a) !== compatibility(b)) return compatibility(b) - compatibility(a);
    return (b.filesize || 0) - (a.filesize || 0) || (b.bitrate || 0) - (a.bitrate || 0);
  });

  const groups = new Map();
  for (const format of sorted) {
    const key = groupKey(format);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(format);
  }
  return groups;
}

function option(value, text) {
  const el = document.createElement("option");
  el.value = value;
  el.textContent = text;
  return el;
}

function formatOptionText(format, duplicates) {
  let text = format.container.toUpperCase();
  if (format.video_codec) text += ` · ${format.video_codec}`;
  if (format.filesize) {
    text += ` · ${formatSize(format.filesize, format.filesize_approximate)}`;
  }
  if (duplicates) text += ` [${format.id}]`;
  return text;
}

function renderChips() {
  const selected = els.quality.value;
  els.qualityChips.replaceChildren(
    ...[...current.groups.entries()].map(([key, group]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quality-chip";
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", String(key === selected));
      const height = parseHeight(key);
      const name = group[0].type === "audio" ? "MP3 / M4A / Opus" : QUALITY_NAMES[height];
      chip.textContent = key;
      if (name) {
        const small = document.createElement("small");
        small.textContent = name;
        chip.append(small);
      }
      chip.addEventListener("click", () => {
        els.quality.value = key;
        fillFormats();
      });
      return chip;
    }),
  );
}

function fillFormats() {
  const group = current.groups.get(els.quality.value) ?? [];
  const labels = group.map((f) => formatOptionText(f, false));
  els.format.replaceChildren(
    ...group.map((f, i) => option(f.id, formatOptionText(f, labels.filter((l) => l === labels[i]).length > 1))),
  );
  renderChips();
  updateSize();
}

function selectedFormat() {
  return current?.analysis.formats.find((f) => f.id === els.format.value) ?? null;
}

function fillOutputs() {
  const format = selectedFormat();
  const choices = format?.type === "audio" ? AUDIO_OUTPUTS : VIDEO_OUTPUTS;
  els.output.replaceChildren(
    option("", `Same as source (${(format?.container || "").toUpperCase()})`),
    ...choices.filter((c) => c !== format?.container).map((c) => option(c, c.toUpperCase())),
  );
}

function updateMoreSummary() {
  const format = selectedFormat();
  if (!els.moreOptionsSummary) return;
  const out = els.output.value ? els.output.selectedOptions[0].textContent : "original";
  els.moreOptionsSummary.textContent = format
    ? `${format.container.toUpperCase()}${format.video_codec ? " · " + format.video_codec : ""} → ${out}`
    : "";
}

function updateSize() {
  const format = selectedFormat();
  if (els.size) {
    els.size.textContent = format ? formatSize(format.filesize, format.filesize_approximate) : "Unknown";
  }
  fillOutputs();

  // Populate formatted specs line (e.g. MP4 · 1080p · 3.2 MB · 3:33)
  updateMoreSummary();
  if (els.mediaSpecs) {
    const parts = [];
    if (format?.container) parts.push(format.container.toUpperCase());
    if (format?.resolution) parts.push(format.resolution);
    if (format?.filesize) parts.push(formatSize(format.filesize, format.filesize_approximate));
    if (current?.analysis?.duration) parts.push(formatDuration(current.analysis.duration));
    els.mediaSpecs.textContent = parts.length > 0 ? parts.join(" · ") : "Ready to download";
  }
}

/** The Download button is usable whenever a result with a chosen format is shown. */
export function syncDownloadButton() {
  els.download.disabled = selectedFormat() === null;
  els.downloadHint.textContent = "Safe & secure download";
}

export function renderMedia(analysis) {
  const groups = groupFormats(analysis.formats);
  current = { analysis, groups };

  if (els.cardEmptyState) els.cardEmptyState.hidden = true;

  els.title.textContent = analysis.title;
  if (els.source) els.source.textContent = analysis.source_label;
  if (els.duration) els.duration.textContent = formatDuration(analysis.duration);

  if (typeof analysis.thumbnail === "string" && analysis.thumbnail.startsWith("data:image/")) {
    els.thumbImg.src = analysis.thumbnail;
    els.thumbImg.hidden = false;
    els.thumbFallback.hidden = true;
  } else {
    els.thumbImg.removeAttribute("src");
    els.thumbImg.hidden = true;
    els.thumbFallback.hidden = false;
  }

  els.quality.replaceChildren(...[...groups.keys()].map((key) => option(key, key)));
  fillFormats();
  els.quality.onchange = fillFormats;
  els.output.onchange = updateMoreSummary;
  els.format.onchange = () => {
    updateSize();
    syncDownloadButton();
  };

  syncDownloadButton();
  els.card.hidden = false;
  els.card.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

export function hideMedia() {
  current = null;
  els.card.hidden = true;
  if (els.cardEmptyState) {
    els.cardEmptyState.hidden = false;
  }
}

export function getCurrentAnalysis() {
  return current?.analysis ?? null;
}

/** What the user picked: the analyzed URL, the format, and the optional "Save as" container. */
export function getSelection() {
  const format = selectedFormat();
  return current && format ? { url: current.analysis.url, format, output: els.output.value || null } : null;
}
