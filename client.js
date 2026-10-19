/**
 * Browser half of `/btw`: the answer as a readable aside, not one clipped row.
 *
 * The host half answers a side question outside the conversation history and
 * settles the command with the answer text. The generic command card renders
 * that text as a single ellipsized line and only offers expansion when the
 * text happens to contain a newline, so a one-paragraph answer can never be
 * read in full.
 *
 * This half replaces the row for the `btw` command only
 * (`conversation.chat.commandview`, keyed by the command name): a left-ruled
 * aside that keeps the question visible, collapses on click, and renders the
 * answer as Markdown. Every other command keeps the generic card.
 *
 * @module @local/btw-live/client
 */

window.__ModuleLoader__.load({
  id: "@local/btw-live",
  factory(require) {
    const React = require("react");
    const { MarkdownText } = require("@deepseek-ai/dsh-client-ui-primitives");

    /** Command-row slot; the key is the command name the owner dispatches. */
    const SLOT = "conversation.chat.commandview";
    const COMMAND = "btw";
    /** Dictionary namespace owned by this plugin. */
    const NS = "btw";
    const STYLE_TAG = "@local/btw-live/BtwCommandCard.module.css";

    const CSS = `
.btwlive_root {
  box-sizing: border-box;
  min-width: 0;
  margin: 8px 0 12px;
  padding: 8px 12px 10px;
  border-left: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  border-radius: 0 var(--dsw-radius-lg, 8px) var(--dsw-radius-lg, 8px) 0;
  background: var(--dsw-alias-bg-layer-1, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 5%, transparent);
  color: var(--dsw-alias-label-primary, inherit);
}
.btwlive_head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.btwlive_head:focus-visible {
  outline: 1.5px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary, #4d6bfe));
  outline-offset: 3px;
  border-radius: var(--dsw-radius-sm, 4px);
}
.btwlive_badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  color: var(--dsw-alias-brand-primary, #4d6bfe);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  letter-spacing: 0.06em;
}
.btwlive_glyph {
  flex: none;
  width: 12px;
  height: 12px;
}
.btwlive_question {
  display: -webkit-box;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  color: var(--dsw-alias-label-secondary, #666);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(18px + var(--dsh-content-font-delta-secondary, 0px));
  overflow-wrap: anywhere;
}
.btwlive_chevron {
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--dsw-alias-label-tertiary, #999);
  transition: transform 0.12s ease;
}
.btwlive_root[data-open="false"] .btwlive_chevron {
  transform: rotate(-90deg);
}
.btwlive_body {
  min-width: 0;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.25));
}
.btwlive_markdown {
  min-width: 0;
  max-height: min(440px, 60vh);
  overflow: auto;
  overscroll-behavior: contain;
}
.btwlive_markdown > :first-child {
  margin-top: 0;
}
.btwlive_markdown > :last-child {
  margin-bottom: 0;
}
.btwlive_pending,
.btwlive_empty {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary, #999);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 20px;
}
.btwlive_dots {
  display: inline-flex;
  gap: 3px;
}
.btwlive_dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  animation: btwlive-pulse 1.1s ease-in-out infinite;
}
.btwlive_dot:nth-child(2) {
  animation-delay: 0.15s;
}
.btwlive_dot:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes btwlive-pulse {
  0%, 80%, 100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-1.5px);
  }
}
.btwlive_error {
  max-height: min(240px, 40vh);
  overflow: auto;
  color: var(--dsw-alias-state-error-primary, #d33);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 20px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: reduce) {
  .btwlive_dot {
    animation: none;
    opacity: 0.6;
  }
  .btwlive_chevron {
    transition: none;
  }
}
`;

    if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`) === null) {
      const style = document.createElement("style");
      style.dataset.plugin = "@local/btw-live";
      style.dataset.pluginCss = STYLE_TAG;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    /** Flat dictionaries: every key is a literal lookup key, dots included. */
    const DICTS = {
      ja: {
        title: "BTW",
        question: "横からの質問",
        thinking: "考えています",
        failed: "回答を取得できませんでした",
        empty: "回答がありません",
        copy: "コピー",
        copied: "コピーしました",
        "codeBlock.title": "コード",
        "codeBlock.wrap": "折り返す",
        "codeBlock.unwrap": "折り返さない",
        footnotes: "脚注",
      },
      en: {
        title: "BTW",
        question: "Side question",
        thinking: "Thinking",
        failed: "The answer could not be produced",
        empty: "No answer",
        copy: "Copy",
        copied: "Copied",
        "codeBlock.title": "Code",
        "codeBlock.wrap": "Wrap",
        "codeBlock.unwrap": "No wrap",
        footnotes: "Footnotes",
      },
      zh: {
        title: "BTW",
        question: "旁注问题",
        thinking: "正在思考",
        failed: "未能生成回答",
        empty: "没有回答",
        copy: "复制",
        copied: "已复制",
        "codeBlock.title": "代码",
        "codeBlock.wrap": "自动换行",
        "codeBlock.unwrap": "取消换行",
        footnotes: "脚注",
      },
    };

    /**
     * Localized chrome for the Markdown renderer.
     * Built per render so a locale switch reaches the code-block controls
     * without remounting the row; the text is settled, not streaming, so a
     * fresh labels object costs no parser cache.
     *
     * @param {Function} t - namespace translator.
     * @returns {object} Markdown chrome labels.
     */
    function markdownLabels(t) {
      return {
        code: {
          copyLabel: t("copy"),
          copiedLabel: t("copied"),
          toolbarLabels: {
            codeLabel: t("codeBlock.title"),
            wrapLabel: t("codeBlock.wrap"),
            unwrapLabel: t("codeBlock.unwrap"),
          },
        },
        footnotes: t("footnotes"),
      };
    }

    /** Four-point sparkle that marks the aside as a side note. */
    function Glyph() {
      return React.createElement(
        "svg",
        {
          className: "btwlive_glyph",
          viewBox: "0 0 12 12",
          width: 12,
          height: 12,
          fill: "currentColor",
          "aria-hidden": "true",
          focusable: "false",
        },
        React.createElement("path", {
          d: "M6 1.2 7.05 4.95 10.8 6 7.05 7.05 6 10.8 4.95 7.05 1.2 6 4.95 4.95Z",
        }),
      );
    }

    /** Disclosure chevron; the root rotates it when the body is closed. */
    function Chevron() {
      return React.createElement(
        "svg",
        {
          className: "btwlive_chevron",
          viewBox: "0 0 12 12",
          width: 12,
          height: 12,
          fill: "none",
          "aria-hidden": "true",
          focusable: "false",
        },
        React.createElement("path", {
          d: "M3 4.5 6 7.5 9 4.5",
          stroke: "currentColor",
          strokeWidth: 1.2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      );
    }

    /** Three pulsing dots shown while the side question is still running. */
    function Dots() {
      return React.createElement(
        "span",
        { className: "btwlive_dots", "aria-hidden": "true" },
        ["a", "b", "c"].map((key) => React.createElement("span", { key, className: "btwlive_dot" })),
      );
    }

    /**
     * Render one `/btw` command lifecycle as a readable aside.
     *
     * The command row gives the folded lifecycle: `args` holds the question,
     * `outcome` is null while running and then carries the answer text.
     *
     * @param {{ node: object, t: Function }} props - owner node and locale seat.
     * @returns {object} the aside.
     */
    function BtwCommandCard({ node, t }) {
      const [open, setOpen] = React.useState(true);
      const translate = typeof t === "function" ? t : (key) => key;

      const outcome = node?.outcome ?? null;
      const running = outcome === null;
      const failed = !running && outcome.kind === "error";
      const text = !running && typeof outcome.text === "string" ? outcome.text.replace(/\s+$/, "") : "";
      const question = typeof node?.args === "string" ? node.args.trim() : "";
      const title = question === "" ? translate("question") : question;
      const state = running ? "running" : failed ? "error" : "ok";

      const toggle = React.useCallback(() => {
        setOpen((value) => !value);
      }, []);

      // A collapsed pending card would hide the answer that just arrived.
      const wasRunning = React.useRef(running);
      React.useEffect(() => {
        if (wasRunning.current && !running) setOpen(true);
        wasRunning.current = running;
      }, [running]);

      let body;
      if (running) {
        body = React.createElement(
          "div",
          { className: "btwlive_pending", role: "status" },
          React.createElement("span", null, translate("thinking")),
          React.createElement(Dots, null),
        );
      } else if (failed) {
        body = React.createElement(
          "div",
          { className: "btwlive_error", role: "alert" },
          text === "" ? translate("failed") : text,
        );
      } else if (text === "") {
        body = React.createElement("div", { className: "btwlive_empty" }, translate("empty"));
      } else {
        body = React.createElement(
          "div",
          { className: "btwlive_markdown" },
          React.createElement(MarkdownText, {
            text,
            labels: markdownLabels(translate),
            variant: "compact",
          }),
        );
      }

      return React.createElement(
        "section",
        {
          className: "btwlive_root",
          "data-btw": "",
          "data-state": state,
          "data-open": open ? "true" : "false",
        },
        React.createElement(
          "button",
          {
            type: "button",
            className: "btwlive_head",
            "aria-expanded": open,
            onClick: toggle,
          },
          React.createElement(
            "span",
            { className: "btwlive_badge" },
            React.createElement(Glyph, null),
            React.createElement("span", null, translate("title")),
          ),
          React.createElement("span", { className: "btwlive_question", title }, title),
          React.createElement(Chevron, null),
        ),
        open ? React.createElement("div", { className: "btwlive_body" }, body) : null,
      );
    }

    /**
     * Register dictionaries and the keyed command-row renderer.
     *
     * @param {object} ctx - client plugin context.
     */
    function apply(ctx) {
      for (const [locale, dict] of Object.entries(DICTS)) {
        ctx.effect(() => ctx.locale.register(NS, locale, dict), `btw-live: ${locale} dictionary`);
      }
      // Wait for the Chat row declaration, then claim only the `btw` cell.
      ctx.slots.inject(SLOT, () =>
        ctx.slots.register({ name: SLOT, key: COMMAND, locale: NS }, BtwCommandCard),
      );
    }

    return { inject: ["slots", "locale"], apply };
  },
});
