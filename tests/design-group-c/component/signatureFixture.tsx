import { useState } from "react";
import { SignaturePad } from "../../../src/features/contracts/components/contracts/SignaturePad";

export function SignatureFixture() {
  const [disabled, setDisabled] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [saved, setSaved] = useState("");
  return <main className="p-4">
    <h1>Fixture ficticio local · firma</h1>
    <button onClick={() => setDisabled(!disabled)}>Alternar bloqueo</button>
    <button onClick={() => setNarrow(!narrow)}>Cambiar ancho</button>
    <div style={{ width: narrow ? 240 : "100%", maxWidth: 400 }}>
      <SignaturePad disabled={disabled} onSave={setSaved} onClear={() => setSaved("")} />
    </div>
    {saved && <img src={saved} alt="Firma PNG confirmada" />}
  </main>;
}
