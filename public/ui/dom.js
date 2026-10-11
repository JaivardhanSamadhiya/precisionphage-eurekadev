export const element = (id) => document.getElementById(id);

export function escapeHTML(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => entities[character],
  );
}

export const formatMetric = (value) =>
  Number.isFinite(value) ? value.toFixed(3) : "Unavailable";
export const formatScore = (value) => value.toFixed(6);
export const assayLabel = (value) =>
  value === 1
    ? ["positive", "Positive"]
    : value === 0
      ? ["negative", "Negative"]
      : ["unknown", "Unavailable"];

export function setOptions(select, options, selected) {
  select.replaceChildren(
    ...options.map(([value, label]) => {
      const option = new Option(label, value);
      option.selected = String(value) === String(selected);
      return option;
    }),
  );
}

export function downloadJSON(filename, value) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
