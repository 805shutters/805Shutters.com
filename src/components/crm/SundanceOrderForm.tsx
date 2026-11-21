export type SundanceOrderFormField = {
  key: string;
  label: string;
  ask_order: number;
  input_kind: "buttons" | "typed";
  required: boolean;
  pending: string | null;
  choices: Array<{ value: string; label: string }>;
};

export type SundanceOrderFormSchema = {
  product_name: string;
  product_key: string;
  portal_ordering_type: string;
  status: string;
  fields: SundanceOrderFormField[];
};

export function SundanceOrderForm({ schema }: { schema: SundanceOrderFormSchema }) {
  return (
    <form aria-label={`${schema.product_name} order form`}>
      <h1>{schema.product_name}</h1>
      <p>{schema.portal_ordering_type}</p>
      {schema.status === "blocked" ? <p>Blocked until Sundance confirms this ordering type.</p> : null}
      <ol>
        {schema.fields.map((field) => (
          <li key={field.key}>
            <span>{field.label}</span>
            {field.pending ? <em>Pending — {field.pending}</em> : null}
            {field.choices.map((choice) => (
              <button key={choice.value} type="button">{choice.label}</button>
            ))}
          </li>
        ))}
      </ol>
    </form>
  );
}
