import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const LANGUAGES = {
  bash, c, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, kotlin,
  markdown, php, python, ruby, rust, sql, swift, typescript, xml, yaml,
};
for (const [name, def] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, def);

const ALIASES: Record<string, string> = {
  sh: "bash", shell: "bash", zsh: "bash", js: "javascript", jsx: "javascript", ts: "typescript",
  tsx: "typescript", py: "python", rs: "rust", yml: "yaml", html: "xml", md: "markdown",
  "c++": "cpp", cs: "csharp", rb: "ruby", kt: "kotlin", toml: "ini", docker: "dockerfile",
};

export function resolveLanguage(lang: string | undefined): string | null {
  if (!lang) return null;
  const name = ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();
  return hljs.getLanguage(name) ? name : null;
}

/** Returns highlighted HTML (escaped by highlight.js) for a known language, else auto-detects. */
export function highlight(code: string, lang: string | undefined): { html: string; language: string } {
  const language = resolveLanguage(lang);
  if (language) return { html: hljs.highlight(code, { language, ignoreIllegals: true }).value, language };
  const auto = hljs.highlightAuto(code);
  return { html: auto.value, language: auto.language ?? "text" };
}
