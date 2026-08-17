const replies = [
  "hahah ja ich. war viel zu lang in der sonne, bin komplett rot 😭",
  "was machst du gerade? ich koch irgendwie pasta für vier obwohl ich alleine bin",
  "bleib einfach. ich langweil mich sonst nur an der bar.",
];

const log = document.getElementById("chat-log");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const paywall = document.getElementById("paywall");
const unlock = document.getElementById("unlock");

let sent = 0;

function addBubble(text, who) {
  const el = document.createElement("div");
  el.className = `bubble ${who}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || sent >= replies.length) return;

  addBubble(text, "out");
  input.value = "";
  const reply = replies[sent];
  sent += 1;

  const typing = addBubble("•••", "in typing");
  window.setTimeout(() => {
    typing.remove();
    addBubble(reply, "in");
    if (sent >= replies.length) {
      input.disabled = true;
      input.placeholder = "lea wartet…";
      window.setTimeout(() => paywall.classList.remove("hidden"), 700);
    }
  }, 850);
});

unlock.addEventListener("click", () => {
  paywall.classList.add("hidden");
  input.disabled = false;
  input.placeholder = "Nachricht schreiben…";
  input.focus();
  addBubble("gut. dann bleibst du.", "in");
});

input.focus();
