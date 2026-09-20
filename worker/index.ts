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

type CustomerImportInput = {
	rows?: unknown;
};

type CustomerImportRow = {
	customer_name: string;
	customer_note: string;
	material_request: {
		name: string;
		note: string;
		due_date: string;
		status: "not_requested" | "requested" | "submitted";
	} | null;
};

type MaterialRequest = {
	id: number;
	customer_id: number;
	name: string;
	note: string;
	due_date: string;
	status: "not_requested" | "requested" | "submitted";
	submitted_at: string | null;
	created_at: string;
	updated_at: string;
};

type DeadlineMaterialRequest = MaterialRequest & {
	customer_name: string;
};

type DashboardMaterialRequest = Pick<MaterialRequest, "customer_id" | "due_date" | "status">;

type DashboardCustomer = Customer & {
	status: "in_progress" | "overdue" | "completed";
	total_requests: number;
	submitted_requests: number;
	nearest_due_date: string | null;
	overdue_days: number | null;
};

type MaterialRequestInput = {
	name?: unknown;
	note?: unknown;
	due_date?: unknown;
};

type MaterialRequestStatusInput = {
	status?: unknown;
};

function jsonError(message: string, status = 400) {
	return Response.json({ error: message }, { status });
}

function customerId(pathname: string) {
	const match = pathname.match(/^\/api\/customers\/(\d+)$/);
	return match ? Number(match[1]) : null;
}

function customerRequestsId(pathname: string) {
	const match = pathname.match(/^\/api\/customers\/(\d+)\/requests$/);
	return match ? Number(match[1]) : null;
}

function materialRequestId(pathname: string) {
	const match = pathname.match(/^\/api\/material-requests\/(\d+)$/);
	return match ? Number(match[1]) : null;
}

function materialRequestStatusId(pathname: string) {
	const match = pathname.match(/^\/api\/material-requests\/(\d+)\/status$/);
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

async function readCustomerImportInput(request: Request) {
	try {
		const input = (await request.json()) as CustomerImportInput;
		if (!Array.isArray(input.rows) || input.rows.length === 0) {
			return { error: "가져올 내용이 없습니다." } as const;
		}
		if (input.rows.length > 500) {
			return { error: "한 번에 500줄까지만 가져올 수 있습니다." } as const;
		}

		const rows = input.rows.map((row) => {
			const value = row as Partial<CustomerImportRow>;
			const materialRequest = value.material_request;
			return {
				customer_name: typeof value.customer_name === "string" ? value.customer_name.trim() : "",
				customer_note: typeof value.customer_note === "string" ? value.customer_note.trim() : "",
				material_request: materialRequest && typeof materialRequest === "object" ? {
					name: typeof materialRequest.name === "string" ? materialRequest.name.trim() : "",
					note: typeof materialRequest.note === "string" ? materialRequest.note.trim() : "",
					due_date: typeof materialRequest.due_date === "string" ? materialRequest.due_date : "",
					status: materialRequest.status,
				} : null,
			};
		});
		if (rows.some((row) => !row.customer_name || row.customer_name.length > 100 || row.customer_note.length > 500)) {
			return { error: "고객 이름 또는 고객 메모 내용을 확인해 주세요." } as const;
		}
		if (rows.some((row) => row.material_request && (
			!row.material_request.name || row.material_request.name.length > 100 || row.material_request.note.length > 500
			|| !/^\d{4}-\d{2}-\d{2}$/.test(row.material_request.due_date)
			|| !["not_requested", "requested", "submitted"].includes(row.material_request.status)
		))) {
			return { error: "자료 이름, 메모, 마감일 또는 제출 상태를 확인해 주세요." } as const;
		}

		return { rows } as const;
	} catch {
		return { error: "가져올 고객 내용을 읽을 수 없습니다." } as const;
	}
}

async function readMaterialRequestInput(request: Request) {
	try {
		const input = (await request.json()) as MaterialRequestInput;
		const name = typeof input.name === "string" ? input.name.trim() : "";
		const note = typeof input.note === "string" ? input.note.trim() : "";
		const dueDate = typeof input.due_date === "string" ? input.due_date : "";

		if (!name) return { error: "자료 이름을 입력해 주세요." } as const;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "마감일을 입력해 주세요." } as const;

		return { name, note, dueDate } as const;
	} catch {
		return { error: "입력 내용을 읽을 수 없습니다." } as const;
	}
}

async function readMaterialRequestStatus(request: Request) {
	try {
		const input = (await request.json()) as MaterialRequestStatusInput;
		if (input.status === "not_requested" || input.status === "requested" || input.status === "submitted") {
			return { status: input.status } as const;
		}
		return { error: "올바른 제출 상태를 선택해 주세요." } as const;
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

		if (url.pathname === "/api/customers/import" && request.method === "POST") {
			const input = await readCustomerImportInput(request);
			if ("error" in input) return jsonError(input.error);

			const existingCustomers = await env.DB.prepare("SELECT id, name FROM customers ORDER BY id DESC").all<Pick<Customer, "id" | "name">>();
			const customerIds = new Map<string, number>();
			for (const customer of existingCustomers.results) {
				if (!customerIds.has(customer.name)) customerIds.set(customer.name, customer.id);
			}

			let createdCustomers = 0;
			for (const row of input.rows) {
				if (customerIds.has(row.customer_name)) continue;
				const result = await env.DB.prepare("INSERT INTO customers (name, note) VALUES (?, ?)")
					.bind(row.customer_name, row.customer_note)
					.run();
				customerIds.set(row.customer_name, Number(result.meta.last_row_id));
				createdCustomers += 1;
			}

			const materialRequests = input.rows
				.filter((row): row is CustomerImportRow & { material_request: NonNullable<CustomerImportRow["material_request"]> } => row.material_request !== null)
				.map((row) => env.DB.prepare(
					"INSERT INTO material_requests (customer_id, name, note, due_date, status, submitted_at) VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE NULL END)",
				).bind(
					customerIds.get(row.customer_name),
					row.material_request.name,
					row.material_request.note,
					row.material_request.due_date,
					row.material_request.status,
					row.material_request.status,
				));
			if (materialRequests.length > 0) await env.DB.batch(materialRequests);

			return Response.json({ created_customers: createdCustomers, added_material_requests: materialRequests.length }, { status: 201 });
		}

		if (url.pathname === "/api/dashboard" && request.method === "GET") {
			const today = url.searchParams.get("today") ?? "";
			if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
				return jsonError("오늘 날짜를 올바르게 입력해 주세요.");
			}

			const [customerResult, requestResult] = await Promise.all([
				env.DB.prepare("SELECT id, name, note, created_at, updated_at FROM customers ORDER BY created_at DESC").all<Customer>(),
				env.DB.prepare("SELECT customer_id, due_date, status FROM material_requests").all<DashboardMaterialRequest>(),
			]);
			const customers = customerResult.results;
			const requests = requestResult.results;
			const dashboardCustomers: DashboardCustomer[] = [];
			let inProgressCustomers = 0;
			let overdueCustomers = 0;
			let completedCustomers = 0;

			for (const customer of customers) {
				const customerRequests = requests.filter((materialRequest) => materialRequest.customer_id === customer.id);
				const openRequests = customerRequests.filter((materialRequest) => materialRequest.status !== "submitted");
				const overdueRequestsForCustomer = openRequests.filter((materialRequest) => materialRequest.due_date < today);
				const isDelayed = overdueRequestsForCustomer.length > 0;
				const nearestOpenRequest = [...openRequests].sort((first, second) => first.due_date.localeCompare(second.due_date))[0];
				let status: DashboardCustomer["status"];
				if (isDelayed) {
					status = "overdue";
					overdueCustomers += 1;
				} else if (customerRequests.length > 0 && customerRequests.every((materialRequest) => materialRequest.status === "submitted")) {
					status = "completed";
					completedCustomers += 1;
				} else {
					status = "in_progress";
					inProgressCustomers += 1;
				}

				dashboardCustomers.push({
					...customer,
					status,
					total_requests: customerRequests.length,
					submitted_requests: customerRequests.filter((materialRequest) => materialRequest.status === "submitted").length,
					nearest_due_date: nearestOpenRequest?.due_date ?? null,
					overdue_days: isDelayed
						? Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${nearestOpenRequest!.due_date}T00:00:00`).getTime()) / 86_400_000)
						: null,
				});
			}

			const submittedRequests = requests.filter((materialRequest) => materialRequest.status === "submitted").length;
			const unsubmittedRequests = requests.length - submittedRequests;
			const overdueRequests = requests.filter(
				(materialRequest) => materialRequest.status !== "submitted" && materialRequest.due_date < today,
			).length;

			return Response.json({
				summary: {
					total_customers: customers.length,
					in_progress_customers: inProgressCustomers,
				overdue_customers: overdueCustomers,
					completed_customers: completedCustomers,
					submitted_requests: submittedRequests,
					unsubmitted_requests: unsubmittedRequests,
					overdue_requests: overdueRequests,
				},
				customers: dashboardCustomers,
			});
		}

		if (url.pathname === "/api/material-requests/deadlines" && request.method === "GET") {
			const today = url.searchParams.get("today") ?? "";
			if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
				return jsonError("오늘 날짜를 올바르게 입력해 주세요.");
			}

			const result = await env.DB.prepare(
				"SELECT material_requests.id, material_requests.customer_id, material_requests.name, material_requests.note, material_requests.due_date, material_requests.status, material_requests.submitted_at, material_requests.created_at, material_requests.updated_at, customers.name AS customer_name FROM material_requests JOIN customers ON customers.id = material_requests.customer_id WHERE material_requests.status != 'submitted' AND material_requests.due_date <= ? ORDER BY material_requests.due_date ASC, material_requests.created_at DESC",
			)
				.bind(today)
				.all<DeadlineMaterialRequest>();
			return Response.json({ requests: result.results });
		}

		const requestCustomerId = customerRequestsId(url.pathname);
		if (requestCustomerId !== null && request.method === "GET") {
			const result = await env.DB.prepare(
				"SELECT id, customer_id, name, note, due_date, status, submitted_at, created_at, updated_at FROM material_requests WHERE customer_id = ? ORDER BY due_date ASC, created_at DESC",
			)
				.bind(requestCustomerId)
				.all<MaterialRequest>();
			return Response.json({ requests: result.results });
		}

		if (requestCustomerId !== null && request.method === "POST") {
			const input = await readMaterialRequestInput(request);
			if ("error" in input) return jsonError(input.error);

			const customer = await env.DB.prepare("SELECT id FROM customers WHERE id = ?")
				.bind(requestCustomerId)
				.first();
			if (!customer) return jsonError("고객을 찾을 수 없습니다.", 404);

			const result = await env.DB.prepare(
				"INSERT INTO material_requests (customer_id, name, note, due_date) VALUES (?, ?, ?, ?)",
			)
				.bind(requestCustomerId, input.name, input.note, input.dueDate)
				.run();
			const materialRequest = await env.DB.prepare(
				"SELECT id, customer_id, name, note, due_date, status, submitted_at, created_at, updated_at FROM material_requests WHERE id = ?",
			)
				.bind(result.meta.last_row_id)
				.first<MaterialRequest>();

			return Response.json({ request: materialRequest }, { status: 201 });
		}

		const statusRequestId = materialRequestStatusId(url.pathname);
		if (statusRequestId !== null && request.method === "PATCH") {
			const input = await readMaterialRequestStatus(request);
			if ("error" in input) return jsonError(input.error);

			const result = await env.DB.prepare(
				"UPDATE material_requests SET status = ?, submitted_at = CASE WHEN ? = 'submitted' THEN COALESCE(submitted_at, CURRENT_TIMESTAMP) ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
			)
				.bind(input.status, input.status, statusRequestId)
				.run();
			if (!result.meta.changes) return jsonError("자료 요청을 찾을 수 없습니다.", 404);

			const materialRequest = await env.DB.prepare(
				"SELECT id, customer_id, name, note, due_date, status, submitted_at, created_at, updated_at FROM material_requests WHERE id = ?",
			)
				.bind(statusRequestId)
				.first<MaterialRequest>();
			return Response.json({ request: materialRequest });
		}

		const requestId = materialRequestId(url.pathname);
		if (requestId !== null && request.method === "PATCH") {
			const input = await readMaterialRequestInput(request);
			if ("error" in input) return jsonError(input.error);

			const result = await env.DB.prepare(
				"UPDATE material_requests SET name = ?, note = ?, due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
			)
				.bind(input.name, input.note, input.dueDate, requestId)
				.run();
			if (!result.meta.changes) return jsonError("자료 요청을 찾을 수 없습니다.", 404);

			const materialRequest = await env.DB.prepare(
				"SELECT id, customer_id, name, note, due_date, status, submitted_at, created_at, updated_at FROM material_requests WHERE id = ?",
			)
				.bind(requestId)
				.first<MaterialRequest>();
			return Response.json({ request: materialRequest });
		}

		if (requestId !== null && request.method === "DELETE") {
			const result = await env.DB.prepare("DELETE FROM material_requests WHERE id = ?")
				.bind(requestId)
				.run();
			if (!result.meta.changes) return jsonError("자료 요청을 찾을 수 없습니다.", 404);

			return new Response(null, { status: 204 });
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
			const result = await env.DB.batch([
				env.DB.prepare("DELETE FROM material_requests WHERE customer_id = ?").bind(id),
				env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(id),
			]);
			if (!result[1].meta.changes) return jsonError("고객을 찾을 수 없습니다.", 404);

			return new Response(null, { status: 204 });
		}

		return jsonError("요청한 기능을 찾을 수 없습니다.", 404);
	},
} satisfies ExportedHandler<Env>;
