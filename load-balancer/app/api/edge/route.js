// load-balancer/app/api/edge/route.js
export const runtime = "edge";

import scaler from "../../../model/scaler.json";
import model from "../../../model/model_weights.json";

// Static round-robin: A -> B -> C -> A ...
let rrIndex = 0;
const BACKENDS = ["A", "B", "C"];

function chooseBackendStatic() {
  const chosen = BACKENDS[rrIndex % BACKENDS.length];
  rrIndex += 1;
  return chosen;
}


const FEATURE_ORDER = [
  "dur",
  "spkts",
  "dpkts",
  "sbytes",
  "dbytes",
  "rate",
  "sload",
  "dload",
  "sinpkt",
  "dinpkt",
  "sjit",
  "djit",
];


function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function scoreFlow(flow) {
  const mean = scaler.mean;
  const scale = scaler.scale;
  const weights = model.weights;
  const bias = model.bias;

  if (
    mean.length !== FEATURE_ORDER.length ||
    scale.length !== FEATURE_ORDER.length ||
    weights.length !== FEATURE_ORDER.length
  ) {
    throw new Error("Model/scaler dimensions do not match FEATURE_ORDER.");
  }

  let z = bias;

  for (let i = 0; i < FEATURE_ORDER.length; i++) {
    const key = FEATURE_ORDER[i];
    const raw = Number(flow?.[key]);

    if (!Number.isFinite(raw)) {
      throw new Error(`Missing or non-numeric feature: ${key}`);
    }

    const xNorm = (raw - mean[i]) / scale[i];
    z += weights[i] * xNorm;
  }

  return sigmoid(z);
}

function decide(score) {
  if (score >= 0.85) return "BLOCK";
  if (score >= 0.60) return "REROUTE";
  return "ALLOW";
}

export async function POST(req) {
  try {
    const body = await req.json();
    const flow = body?.flow;

    const attack_score = scoreFlow(flow);
    const decision = decide(attack_score);

    let chosen_backend = null;
    if (decision === "ALLOW") {
      chosen_backend = chooseBackendStatic();
    }

    return Response.json({
      attack_score,
      decision,
      chosen_backend,
    });
  } catch (err) {
    return Response.json(
      { error: err?.message || "Unknown error" },
      { status: 400 }
    );
  }
}


// Optional: friendly message if you open /api/edge in browser
export async function GET() {
  return Response.json({
  attack_score,
  decision,
  chosen_backend,
});

}
