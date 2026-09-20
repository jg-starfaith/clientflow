type Customer = {
	id: number;
	name: string;
	note: string;
	created_at: string;
	updated_at: string;
};

type CustomerInput = {
	name?: unknown;
	note?: unknown;
};

function jsonError(message: string, status = 400) {
	return Response.json({ error: message }, { status });
}

function customerId(pathname: string) {
	const match = pathname.match(/^\/api\/customers\/(\d+)$/);
	return match ? Number(match[1]) : null;
}

async function readCustomerInput(request: Request) {
	try {
		const input = (await request.json()) as CustomerInput;
		const name = typeof input.name === "string" ? input.name.trim() : "";
		const note = typeof input.note === "string" ? input.note.trim() : "";

		if (!name) {
			return { error: "고객 이름을 입력해 주세요." } as const;
		}

		return { name, note } as const;
	} catch {
		return { error: "입력 내용을 읽을 수 없습니다." } as const;
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/api/customers" && request.method === "GET") {
			const search = url.searchParams.get("search")?.trim() ?? "";
			const result = search
				? await env.DB.prepare(
						"SELECT id, name, note, created_at, updated_at FROM customers WHERE name LIKE ? ORDER BY created_at DESC",
					)
						.bind(`%${search}%`)
						.all<Customer>()
				: await env.DB.prepare(
						"SELECT id, name, note, created_at, updated_at FROM customers ORDER BY created_at DESC",
					).all<Customer>();

			return Response.json({ customers: result.results });
		}

		if (url.pathname === "/api/customers" && request.method === "POST") {
			const input = await readCustomerInput(request);
			if ("error" in input) return jsonError(input.error);

			const result = await env.DB.prepare(
				"INSERT INTO customers (name, note) VALUES (?, ?)",
			)
				.bind(input.name, input.note)
				.run();
			const customer = await env.DB.prepare(
				"SELECT id, name, note, created_at, updated_at FROM customers WHERE id = ?",
			)
				.bind(result.meta.last_row_id)
				.first<Customer>();

			return Response.json({ customer }, { status: 201 });
		}

		const id = customerId(url.pathname);
		if (id !== null && request.method === "PATCH") {
			const input = await readCustomerInput(request);
			if ("error" in input) return jsonError(input.error);

			const result = await env.DB.prepare(
				"UPDATE customers SET name = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
			)
				.bind(input.name, input.note, id)
				.run();
			if (!result.meta.changes) return jsonError("고객을 찾을 수 없습니다.", 404);

			const customer = await env.DB.prepare(
				"SELECT id, name, note, created_at, updated_at FROM customers WHERE id = ?",
			)
				.bind(id)
				.first<Customer>();
			return Response.json({ customer });
		}

		if (id !== null && request.method === "DELETE") {
			const result = await env.DB.prepare("DELETE FROM customers WHERE id = ?")
				.bind(id)
				.run();
			if (!result.meta.changes) return jsonError("고객을 찾을 수 없습니다.", 404);

			return new Response(null, { status: 204 });
		}

		return jsonError("요청한 기능을 찾을 수 없습니다.", 404);
	},
} satisfies ExportedHandler<Env>;
