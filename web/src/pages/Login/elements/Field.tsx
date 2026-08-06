import "./Field.css";

export type FieldProps = {
  name: string;
  label: string;
  type: "email" | "password";
  autoComplete: string;
};

export function Field({ name, label, type, autoComplete }: FieldProps) {
  const id = `login-${name}`;
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <input
        className="field__input"
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
      />
    </label>
  );
}
