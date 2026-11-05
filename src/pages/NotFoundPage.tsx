import { Link } from "react-router-dom";

export function NotFoundLeft() {
  return (
    <div className="page-pad page-pad--center empty">
      <div className="missingno" aria-hidden="true" />
      <h2 className="page-title">A WILD MISSINGNO. APPEARED!</h2>
    </div>
  );
}

export function NotFoundRight() {
  return (
    <div className="page-pad page-pad--center">
      <p className="body-text">This page isn't in the Pokédex. It may have been released into the wild.</p>
      <Link to="/" className="btn btn--blue">
        BACK TO INDEX
      </Link>
    </div>
  );
}
