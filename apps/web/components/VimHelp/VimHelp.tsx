"use client";

export function VimHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="vimHelpPopup" id="vim-help-popup" role="dialog" aria-label="Vim keybindings">
      <div className="vimHelpHeader">
        <strong>Vim bindings</strong>
        <button className="vimHelpClose" type="button" aria-label="Close Vim keybindings" onClick={onClose}>
          ×
        </button>
      </div>
      <dl>
        <dt>j / d</dt><dd>Scroll down 100 people</dd>
        <dt>k / u</dt><dd>Scroll up 100 people</dd>
        <dt>gg</dt><dd>Jump to the top</dd>
        <dt>G</dt><dd>Jump to the end</dd>
        <dt>:5000</dt><dd>Jump to a specific rank</dd>
        <dt>:+500</dt><dd>Jump relative to the current rank</dd>
        <dt>/pattern</dt><dd>Search names and WCA IDs with regex</dd>
        <dt>Ctrl+G</dt><dd>Next search result</dd>
        <dt>Ctrl+Shift+G</dt><dd>Previous search result</dd>
      </dl>
    </div>
  );
}
