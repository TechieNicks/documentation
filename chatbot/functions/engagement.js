const { getStore } = require("@netlify/blobs");

const allowedActions = ["view", "get", "like", "unlike"];

exports.handler = async function (event) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
    if (event.httpMethod !== "POST") return response(405, headers, { error: "Method not allowed" });

    let payload;
    try { payload = JSON.parse(event.body || "{}"); } catch (error) { return response(400, headers, { error: "Invalid JSON body" }); }

    const page = String(payload.page || "").replace(/^\//, "");
    const action = String(payload.action || "");
    if (!/^[a-zA-Z0-9_./-]+\.html$/.test(page) || !allowedActions.includes(action)) {
        return response(400, headers, { error: "Invalid page or action" });
    }

    try {
        const store = getStore("engagement");
        const current = await store.get(page, { type: "json" }) || { views: 0, likes: 0 };
        if (action === "view") current.views += 1;
        if (action === "like") current.likes += 1;
        if (action === "unlike") current.likes = Math.max(0, current.likes - 1);
        await store.setJSON(page, current);
        return response(200, headers, current);
    } catch (error) {
        return response(500, headers, { error: "Engagement storage is unavailable" });
    }
};

function response(statusCode, headers, body) {
    return { statusCode, headers, body: JSON.stringify(body) };
}
