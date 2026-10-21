/* Reads the HubSpot form's definition through the Marketing Forms API
   (GET /marketing/v3/forms/{formId}), for two things the submissions API
   does not do on its own:

   - Hidden-field default values. HubSpot fills these in only when its own
     embed shows the form; a submission through the API carries just what it
     is given. So each hidden field's default is read from the form and sent,
     unless a value of ours is already going in that field. Change a default
     in HubSpot and it applies here within ten minutes, with no deploy.
   - Checking our values first. HubSpot turns down the whole submission over
     one bad field: a property that is not on the form, or a dropdown value
     that is not one of its options (a race name the event dropdown doesn't
     list yet, say). Such a field is left out and logged instead, so the
     contact still gets through, with the field's default if it has one.

   Needs HUBSPOT_TOKEN, a private-app token with the "forms" scope. Without
   it, or if the form has never been readable, lib/hubspot.js sends our
   values as they are, unchecked and without the defaults. */

const API = "https://api.hubapi.com/marketing/v3/forms/";
const CONTACT = "0-1";
const REUSE_MS = 10 * 60 * 1000;

/* Field types whose values must be one of the field's options. */
const CHOICE = new Set(["dropdown", "radio", "multiple_checkboxes"]);

function key(field) {
  return `${field.objectTypeId || CONTACT}/${field.name}`;
}

/* The form's fields, flattened, including fields shown only on a condition. */
function parse(definition) {
  const fields = [];
  function add(f) {
    if (!f || typeof f.name !== "string" || !f.name) return;
    const defaults = Array.isArray(f.defaultValues)
      ? f.defaultValues.filter((v) => v != null && v !== "").map(String)
      : f.defaultValue != null && f.defaultValue !== "" ? [String(f.defaultValue)] : [];
    fields.push({
      name: f.name,
      objectTypeId: f.objectTypeId || CONTACT,
      hidden: f.hidden === true,
      defaults,
      options: CHOICE.has(f.fieldType) && Array.isArray(f.options) && f.options.length
        ? new Set(f.options.map((o) => String(o.value)))
        : null,
      multiple: f.fieldType === "multiple_checkboxes",
    });
    for (const d of f.dependentFields || []) add(d && d.dependentField);
  }
  for (const group of definition.fieldGroups || []) for (const f of group.fields || []) add(f);
  return fields;
}

/* A warm function reuses the definition it last read for ten minutes, and
   keeps using it if HubSpot then can't be reached. Throws only if this form
   has never been read. */
let lastRead = null;

export async function loadFormFields(formId, token) {
  if (lastRead && lastRead.formId === formId && Date.now() - lastRead.at <= REUSE_MS) return lastRead.fields;
  try {
    const res = await fetch(API + encodeURIComponent(formId), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`form definition returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const fields = parse(await res.json());
    if (!fields.length) throw new Error("form definition has no fields");
    lastRead = { formId, fields, at: Date.now() };
  } catch (err) {
    if (!lastRead || lastRead.formId !== formId) throw err;
    console.warn(`HubSpot form unreadable (${err.message}), using the copy read at ${new Date(lastRead.at).toISOString()}`);
  }
  return lastRead.fields;
}

function allowed(field, value) {
  const values = field.multiple ? value.split(";") : [value];
  return values.every((v) => field.options.has(v));
}

/* Our submission fields ({ objectTypeId, name, value }), checked against the
   form, followed by the defaults of the hidden fields we left empty. */
export function applyForm(submission, formFields, ref) {
  const onForm = new Map(formFields.map((f) => [key(f), f]));
  const kept = [];
  const dropped = [];
  for (const s of submission) {
    const field = onForm.get(key(s));
    if (!field) dropped.push(`${s.name} (not on the form)`);
    else if (field.options && !allowed(field, s.value)) dropped.push(`${s.name} "${s.value}" (not one of its options)`);
    else kept.push(s);
  }
  if (dropped.length) console.warn(`HubSpot ${ref}: left out ${dropped.join(", ")}`);

  const filled = new Set(kept.map(key));
  for (const f of formFields) {
    if (!f.hidden || !f.defaults.length || filled.has(key(f))) continue;
    filled.add(key(f));
    kept.push({ objectTypeId: f.objectTypeId, name: f.name, value: f.multiple ? f.defaults.join(";") : f.defaults[0] });
  }
  return kept;
}
