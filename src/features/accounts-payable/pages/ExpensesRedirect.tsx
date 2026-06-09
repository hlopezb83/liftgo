import { Navigate } from "react-router-dom";

export default function ExpensesRedirect() {
  return <Navigate to="/cuentas-por-pagar" replace />;
}
