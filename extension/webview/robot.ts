/** The EchoCode robot. Colours and motion come from CSS, driven by the panel state and --level. */
export const ROBOT_SVG = `
<svg class="robot-svg" viewBox="0 0 64 64" aria-hidden="true">
  <line class="antenna" x1="32" y1="7" x2="32" y2="14" />
  <circle class="antenna-tip" cx="32" cy="5" r="2.6" />
  <rect class="ear" x="6.5" y="25" width="4.5" height="12" rx="2.2" />
  <rect class="ear" x="53" y="25" width="4.5" height="12" rx="2.2" />
  <rect class="head" x="12" y="14" width="40" height="33" rx="10" />
  <rect class="visor" x="17.5" y="21.5" width="29" height="14" rx="7" />
  <g class="eyes">
    <circle class="eye" cx="26" cy="28.5" r="3" />
    <circle class="eye" cx="38" cy="28.5" r="3" />
  </g>
  <rect class="mouth" x="26" y="40" width="12" height="2.2" rx="1.1" />
  <line class="neck" x1="25" y1="52" x2="39" y2="52" />
</svg>`;
