import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { readSheet } from "read-excel-file/browser";
import "./App.css";

type Customer = {
	id: number;
	name: string;
	note: string;
	created_at: string;
};

type MaterialRequest = {
	id: number;
	name: string;
	note: string;
	due_date: string;
	status: "not_requested" | "requested" | "submitted";
	submitted_at: string | null;
};

type DeadlineMaterialRequest = MaterialRequest & {
	customer_id: number;
	customer_name: string;
};

type DeadlineView = "today" | "overdue";

type DashboardSummary = {
	total_customers: number;
	in_progress_customers: number;
	overdue_customers: number;
	completed_customers: number;
	submitted_requests: number;
	unsubmitted_requests: number;
	overdue_requests: number;
};

type DashboardFilter = "all" | "in_progress" | "overdue" | "completed";

type DashboardCustomer = Customer & {
	status: Exclude<DashboardFilter, "all">;
	total_requests: number;
	submitted_requests: number;
	nearest_due_date: string | null;
	overdue_days: number | null;
};

type ImportRow = {
	customer_name: string;
	customer_note: string;
	material_request: {
		name: string;
		note: string;
		due_date: string;
		status: MaterialRequest["status"];
	} | null;
};

type ImportIssue = {
	row: number;
	message: string;
};

function todayString() {
	const now = new Date();
	const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
	return localDate.toISOString().slice(0, 10);
}

function deadlineInfo(materialRequest: MaterialRequest, today = todayString()) {
	if (materialRequest.status === "submitted") return { text: "제출 완료", type: "complete" };
	if (materialRequest.due_date === today) return { text: "오늘 마감", type: "urgent" };
	const difference = Math.round(
		(new Date(`${materialRequest.due_date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
	);
	if (difference < 0) return { text: `${Math.abs(difference)}일 지연`, type: "urgent" };
	return { text: `D-${difference}`, type: "upcoming" };
}

function shortDate(date: string) {
	const [, month, day] = date.split("-");
	return `${Number(month)}/${Number(day)}`;
}

function cellText(value: unknown) {
	return value === null || value === undefined ? "" : String(value).trim();
}

function dateCellText(value: unknown) {
	if (value instanceof Date) {
		const month = String(value.getMonth() + 1).padStart(2, "0");
		const day = String(value.getDate()).padStart(2, "0");
		return `${value.getFullYear()}-${month}-${day}`;
	}
	return cellText(value);
}

function parseCsv(text: string) {
	const rows: string[][] = [];
	let row: string[] = [];
	let value = "";
	let quoted = false;

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (character === '"') {
			if (quoted && text[index + 1] === '"') {
				value += '"';
				index += 1;
			} else {
				quoted = !quoted;
			}
		} else if (character === "," && !quoted) {
			row.push(value);
			value = "";
		} else if ((character === "\n" || character === "\r") && !quoted) {
			if (character === "\r" && text[index + 1] === "\n") index += 1;
			row.push(value);
			rows.push(row);
			row = [];
			value = "";
		} else {
			value += character;
		}
	}
	row.push(value);
	if (row.some((cell) => cell.length > 0)) rows.push(row);
	return rows;
}

function previewImportRows(rows: unknown[][]) {
	const header = (rows[0] ?? []).map((value) => cellText(value).replace(/^\uFEFF/, ""));
	const customerNameIndex = header.indexOf("고객명");
	const customerNoteIndex = header.indexOf("고객메모");
	const materialNameIndex = header.indexOf("자료명");
	const materialNoteIndex = header.indexOf("자료메모");
	const dueDateIndex = header.indexOf("마감일");
	const statusIndex = header.indexOf("제출상태");
	if (customerNameIndex === -1) {
		return { rows: [] as ImportRow[], issues: [{ row: 1, message: "첫 줄에 고객명 항목이 필요합니다." }] };
	}

	const importRows: ImportRow[] = [];
	const issues: ImportIssue[] = [];
	const statusByLabel: Record<string, MaterialRequest["status"]> = {
		"요청 전": "not_requested",
		"요청함": "requested",
		"제출 완료": "submitted",
	};
	rows.slice(1).forEach((row, index) => {
		if (row.every((value) => !cellText(value))) return;
		const customerName = cellText(row[customerNameIndex]);
		const customerNote = customerNoteIndex === -1 ? "" : cellText(row[customerNoteIndex]);
		const materialName = materialNameIndex === -1 ? "" : cellText(row[materialNameIndex]);
		const materialNote = materialNoteIndex === -1 ? "" : cellText(row[materialNoteIndex]);
		const dueDate = dueDateIndex === -1 ? "" : dateCellText(row[dueDateIndex]);
		const statusLabel = statusIndex === -1 ? "" : cellText(row[statusIndex]);
		const hasMaterial = Boolean(materialName || materialNote || dueDate || statusLabel);
		if (!customerName) {
			issues.push({ row: index + 2, message: "고객명이 비어 있습니다." });
		} else if (customerName.length > 100) {
			issues.push({ row: index + 2, message: "고객명은 100자 이하여야 합니다." });
		} else if (customerNote.length > 500 || materialNote.length > 500) {
			issues.push({ row: index + 2, message: "메모는 500자 이하여야 합니다." });
		} else if (hasMaterial && (!materialName || !dueDate || !statusLabel)) {
			issues.push({ row: index + 2, message: "자료명, 마감일, 제출상태를 모두 입력해 주세요." });
		} else if (hasMaterial && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
			issues.push({ row: index + 2, message: "마감일은 YYYY-MM-DD 형식으로 입력해 주세요." });
		} else if (hasMaterial && !statusByLabel[statusLabel]) {
			issues.push({ row: index + 2, message: "제출상태는 요청 전, 요청함, 제출 완료 중 하나여야 합니다." });
		} else {
			importRows.push({ customer_name: customerName, customer_note: customerNote, material_request: hasMaterial ? { name: materialName, note: materialNote, due_date: dueDate, status: statusByLabel[statusLabel] } : null });
		}
	});
	return { rows: importRows, issues };
}

function App() {
	const [customers, setCustomers] = useState<Customer[]>([]);
	const [search, setSearch] = useState("");
	const [name, setName] = useState("");
	const [note, setNote] = useState("");
	const [editingId, setEditingId] = useState<number | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");
	const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
	const [materialRequests, setMaterialRequests] = useState<MaterialRequest[]>([]);
	const [requestName, setRequestName] = useState("");
	const [requestNote, setRequestNote] = useState("");
	const [dueDate, setDueDate] = useState("");
	const [editingRequestId, setEditingRequestId] = useState<number | null>(null);
	const [isRequestLoading, setIsRequestLoading] = useState(false);
	const [isRequestSaving, setIsRequestSaving] = useState(false);
	const [changingStatusId, setChangingStatusId] = useState<number | null>(null);
	const [deadlineRequests, setDeadlineRequests] = useState<DeadlineMaterialRequest[]>([]);
	const [deadlineView, setDeadlineView] = useState<DeadlineView>("today");
	const [isDeadlineLoading, setIsDeadlineLoading] = useState(true);
	const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
	const [dashboardCustomers, setDashboardCustomers] = useState<DashboardCustomer[]>([]);
	const [isDashboardLoading, setIsDashboardLoading] = useState(true);
	const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>("all");
	const [importFileName, setImportFileName] = useState("");
	const [importRows, setImportRows] = useState<ImportRow[]>([]);
	const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
	const [importMessage, setImportMessage] = useState("");
	const [isImportSaving, setIsImportSaving] = useState(false);

	async function loadCustomers(keyword = search) {
		setIsLoading(true);
		setError("");
		try {
			const response = await fetch(`/api/customers?search=${encodeURIComponent(keyword)}`);
			if (!response.ok) throw new Error("고객 목록을 불러오지 못했습니다.");
			const data = (await response.json()) as { customers: Customer[] };
			setCustomers(data.customers);
		} catch (caughtError) {
			setError(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		} finally {
			setIsLoading(false);
		}
	}

	useEffect(() => {
		void loadCustomers(search);
	}, [search]);

	useEffect(() => {
		void loadDeadlineRequests();
	}, []);

	useEffect(() => {
		void loadDashboard();
	}, []);

	function resetForm() {
		setName("");
		setNote("");
		setEditingId(null);
	}

	function resetRequestForm() {
		setRequestName("");
		setRequestNote("");
		setDueDate("");
		setEditingRequestId(null);
	}

	async function loadMaterialRequests(customerId: number) {
		setIsRequestLoading(true);
		setError("");
		try {
			const response = await fetch(`/api/customers/${customerId}/requests`);
			if (!response.ok) throw new Error("자료 요청 목록을 불러오지 못했습니다.");
			const data = (await response.json()) as { requests: MaterialRequest[] };
			setMaterialRequests(data.requests);
		} catch (caughtError) {
			setError(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		} finally {
			setIsRequestLoading(false);
		}
	}

	async function loadDeadlineRequests() {
		setIsDeadlineLoading(true);
		try {
			const response = await fetch(`/api/material-requests/deadlines?today=${todayString()}`);
			if (!response.ok) throw new Error("마감 자료를 불러오지 못했습니다.");
			const data = (await response.json()) as { requests: DeadlineMaterialRequest[] };
			setDeadlineRequests(data.requests);
		} catch (caughtError) {
			setError(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		} finally {
			setIsDeadlineLoading(false);
		}
	}

	async function loadDashboard() {
		setIsDashboardLoading(true);
		try {
			const response = await fetch(`/api/dashboard?today=${todayString()}`);
			if (!response.ok) throw new Error("업무 현황을 불러오지 못했습니다.");
			const data = (await response.json()) as { summary: DashboardSummary; customers: DashboardCustomer[] };
			setDashboardSummary(data.summary);
			setDashboardCustomers(data.customers);
		} catch (caughtError) {
			setError(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		} finally {
			setIsDashboardLoading(false);
		}
	}

	function selectCustomer(customer: Customer) {
		setSelectedCustomer(customer);
		resetRequestForm();
		void loadMaterialRequests(customer.id);
	}

	function downloadImportTemplate() {
		const template = "\uFEFF고객명,고객메모,자료명,자료메모,마감일,제출상태\nABC상사,9월 자료 요청,급여대장,8월분,2026-09-30,요청함\nABC상사,9월 자료 요청,통장내역,법인계좌,2026-09-30,요청 전\n국민무역,,카드 사용내역,,2026-09-25,제출 완료\n";
		const fileUrl = URL.createObjectURL(new Blob([template], { type: "text/csv;charset=utf-8" }));
		const link = document.createElement("a");
		link.href = fileUrl;
		link.download = "clientflow-고객-템플릿.csv";
		link.click();
		URL.revokeObjectURL(fileUrl);
	}

	async function previewImportFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		setImportFileName(file.name);
		setImportRows([]);
		setImportIssues([]);
		setImportMessage("");
		if (file.size > 5 * 1024 * 1024) {
			setImportIssues([{ row: 0, message: "파일 크기는 5MB 이하여야 합니다." }]);
			return;
		}

		try {
			const extension = file.name.split(".").pop()?.toLowerCase();
			const rows = extension === "csv"
				? parseCsv(await file.text())
				: extension === "xlsx"
					? await readSheet(file)
					: null;
			if (!rows) throw new Error("CSV 또는 엑셀(.xlsx) 파일만 선택할 수 있습니다.");

			const preview = previewImportRows(rows);
			setImportRows(preview.rows);
			setImportIssues(preview.issues);
			if (preview.rows.length === 0 && preview.issues.length === 0) {
				setImportMessage("가져올 내용이 없습니다.");
			}
		} catch (caughtError) {
			setImportIssues([{ row: 0, message: caughtError instanceof Error ? caughtError.message : "파일을 읽을 수 없습니다." }]);
		}
	}

	async function importCustomersFromFile() {
		if (importRows.length === 0) return;

		setIsImportSaving(true);
		setImportMessage("");
		try {
			const response = await fetch("/api/customers/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ rows: importRows }),
			});
			const data = (await response.json()) as { created_customers?: number; added_material_requests?: number; error?: string };
			if (!response.ok) throw new Error(data.error ?? "고객을 추가하지 못했습니다.");

			setImportMessage(`새 고객 ${data.created_customers ?? 0}명과 자료 요청 ${data.added_material_requests ?? importRows.length}건을 추가했습니다.`);
			setImportFileName("");
			setImportRows([]);
			setImportIssues([]);
			await Promise.all([loadCustomers(), loadDashboard()]);
		} catch (caughtError) {
			setImportMessage(caughtError instanceof Error ? caughtError.message : "고객을 추가하지 못했습니다.");
		} finally {
			setIsImportSaving(false);
		}
	}

	const visibleDashboardCustomers = dashboardFilter === "all"
		? dashboardCustomers
		: dashboardCustomers.filter((customer) => customer.status === dashboardFilter);
	const dashboardFilterLabel: Record<DashboardFilter, string> = {
		all: "전체 고객",
		in_progress: "진행 중",
		overdue: "지연 고객",
		completed: "완료 고객",
	};
	const importCustomerCount = new Set(importRows.map((row) => row.customer_name)).size;
	const importMaterialRequestCount = importRows.filter((row) => row.material_request !== null).length;

	async function saveCustomer(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!name.trim()) {
			setError("고객 이름을 입력해 주세요.");
			return;
		}

		setIsSaving(true);
		setError("");
		try {
			const response = await fetch(
				editingId === null ? "/api/customers" : `/api/customers/${editingId}`,
				{
					method: editingId === null ? "POST" : "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name, note }),
				},
			);
			const data = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(data.error ?? "고객 정보를 저장하지 못했습니다.");

			resetForm();
			await Promise.all([loadCustomers(), loadDashboard()]);
		} catch (caughtError) {
			setError(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		} finally {
			setIsSaving(false);
		}
	}

	function startEditing(customer: Customer) {
		setEditingId(customer.id);
		setName(customer.name);
		setNote(customer.note);
		setError("");
	}

	async function deleteCustomer(customer: Customer) {
		if (!window.confirm(`'${customer.name}' 고객을 삭제할까요?`)) return;

		setError("");
		try {
			const response = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
			if (!response.ok) throw new Error("고객을 삭제하지 못했습니다.");
			if (editingId === customer.id) resetForm();
			if (selectedCustomer?.id === customer.id) {
				setSelectedCustomer(null);
				setMaterialRequests([]);
				resetRequestForm();
			}
			await Promise.all([loadCustomers(), loadDeadlineRequests(), loadDashboard()]);
		} catch (caughtError) {
			setError(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		}
	}

	async function saveMaterialRequest(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedCustomer) return;
		if (!requestName.trim() || !dueDate) {
			setError("자료 이름과 마감일을 입력해 주세요.");
			return;
		}

		setIsRequestSaving(true);
		setError("");
		try {
			const response = await fetch(
				editingRequestId === null
					? `/api/customers/${selectedCustomer.id}/requests`
					: `/api/material-requests/${editingRequestId}`,
				{
					method: editingRequestId === null ? "POST" : "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: requestName, note: requestNote, due_date: dueDate }),
				},
			);
			const data = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(data.error ?? "자료 요청을 저장하지 못했습니다.");

			resetRequestForm();
			await Promise.all([loadMaterialRequests(selectedCustomer.id), loadDeadlineRequests(), loadDashboard()]);
		} catch (caughtError) {
			setError(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		} finally {
			setIsRequestSaving(false);
		}
	}

	function startEditingMaterialRequest(materialRequest: MaterialRequest) {
		setEditingRequestId(materialRequest.id);
		setRequestName(materialRequest.name);
		setRequestNote(materialRequest.note);
		setDueDate(materialRequest.due_date);
		setError("");
	}

	async function deleteMaterialRequest(materialRequest: MaterialRequest) {
		if (!selectedCustomer || !window.confirm(`'${materialRequest.name}' 요청을 삭제할까요?`)) return;

		setError("");
		try {
			const response = await fetch(`/api/material-requests/${materialRequest.id}`, { method: "DELETE" });
			if (!response.ok) throw new Error("자료 요청을 삭제하지 못했습니다.");
			if (editingRequestId === materialRequest.id) resetRequestForm();
			await Promise.all([loadMaterialRequests(selectedCustomer.id), loadDeadlineRequests(), loadDashboard()]);
		} catch (caughtError) {
			setError(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		}
	}

	async function updateMaterialRequestStatus(
		materialRequest: MaterialRequest,
		status: MaterialRequest["status"],
	) {
		if (!selectedCustomer) return;

		setChangingStatusId(materialRequest.id);
		setError("");
		try {
			const response = await fetch(`/api/material-requests/${materialRequest.id}/status`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status }),
			});
			const data = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(data.error ?? "제출 상태를 저장하지 못했습니다.");

			await Promise.all([loadMaterialRequests(selectedCustomer.id), loadDeadlineRequests(), loadDashboard()]);
		} catch (caughtError) {
			setError(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		} finally {
			setChangingStatusId(null);
		}
	}

	const today = todayString();
	const todayDeadlineRequests = deadlineRequests.filter((materialRequest) => materialRequest.due_date === today);
	const overdueRequests = deadlineRequests.filter((materialRequest) => materialRequest.due_date < today);
	const visibleDeadlineRequests = deadlineView === "today" ? todayDeadlineRequests : overdueRequests;

	return (
		<main className="app-shell">
			<header>
				<p className="eyebrow">CLIENTFLOW</p>
				<h1>고객 관리</h1>
				<p className="subtitle">고객 이름과 메모를 한곳에서 관리하세요.</p>
			</header>

			<section className="dashboard-section" aria-label="업무 현황">
				<div className="dashboard-heading"><h2>고객 현황</h2></div>
				{isDashboardLoading || !dashboardSummary ? <p className="empty-message">불러오는 중...</p> : (
					<>
						<div className="summary-cards">
							<button className={dashboardFilter === "all" ? "active" : ""} type="button" onClick={() => setDashboardFilter("all")}><span>전체</span><strong>{dashboardSummary.total_customers}</strong></button>
							<button className={dashboardFilter === "in_progress" ? "active" : ""} type="button" onClick={() => setDashboardFilter("in_progress")}><span>진행 중</span><strong>{dashboardSummary.in_progress_customers}</strong></button>
							<button className={`overdue-summary ${dashboardFilter === "overdue" ? "active" : ""}`} type="button" onClick={() => setDashboardFilter("overdue")}><span>지연</span><strong>{dashboardSummary.overdue_customers}</strong></button>
							<button className={dashboardFilter === "completed" ? "active" : ""} type="button" onClick={() => setDashboardFilter("completed")}><span>완료</span><strong>{dashboardSummary.completed_customers}</strong></button>
						</div>
						<p className="request-summary">제출 완료 <b>{dashboardSummary.submitted_requests}건</b><span>·</span> 미제출 <b>{dashboardSummary.unsubmitted_requests}건</b><span>·</span> <em>마감 지연 {dashboardSummary.overdue_requests}건</em></p>
						<div className="dashboard-customer-list">
							<h3>{dashboardFilterLabel[dashboardFilter]} {visibleDashboardCustomers.length}명</h3>
							{visibleDashboardCustomers.length === 0 ? <p>해당하는 고객이 없습니다.</p> : <ul>{visibleDashboardCustomers.map((customer) => <li key={customer.id}><div><div className="dashboard-customer-name"><strong>{customer.name}</strong><span className={`dashboard-customer-status ${customer.status}`}>{dashboardFilterLabel[customer.status]}</span></div><p className={customer.status === "overdue" ? "dashboard-customer-meta urgent" : "dashboard-customer-meta"}>{customer.status === "completed" ? "모든 자료 제출 완료" : customer.nearest_due_date ? `마감: ${shortDate(customer.nearest_due_date)}${customer.status === "overdue" ? ` · ${customer.overdue_days}일 지연` : ""}` : "요청 자료 없음"}</p><p className="dashboard-customer-meta">진행률: {customer.submitted_requests} / {customer.total_requests}</p></div><button className="text-button" type="button" onClick={() => selectCustomer(customer)}>자료 보기</button></li>)}</ul>}
						</div>
					</>
				)}
			</section>

			<section className="deadline-section" aria-label="마감 관리">
				<div className="deadline-heading">
					<div><p className="eyebrow">마감 관리</p><h2>오늘 확인할 자료</h2></div>
					<div className="deadline-tabs">
						<button className={deadlineView === "today" ? "deadline-tab active" : "deadline-tab"} type="button" onClick={() => setDeadlineView("today")}>오늘 마감 {todayDeadlineRequests.length}건</button>
						<button className={deadlineView === "overdue" ? "deadline-tab active urgent-tab" : "deadline-tab urgent-tab"} type="button" onClick={() => setDeadlineView("overdue")}>지연 {overdueRequests.length}건</button>
					</div>
				</div>
				{isDeadlineLoading ? <p className="empty-message">불러오는 중...</p> : visibleDeadlineRequests.length === 0 ? <p className="empty-message">{deadlineView === "today" ? "오늘 마감인 자료가 없습니다." : "지연된 자료가 없습니다."}</p> : (
					<ul className="deadline-items">
						{visibleDeadlineRequests.map((materialRequest) => <li key={materialRequest.id}><div><strong>{materialRequest.customer_name}</strong><span>{materialRequest.name}</span></div><b className="deadline-urgent">{deadlineInfo(materialRequest, today).text}</b></li>)}
					</ul>
				)}
			</section>

			<section className="customer-layout" aria-label="고객 관리">
				<form className="customer-form" onSubmit={saveCustomer}>
					<h2>{editingId === null ? "새 고객 추가" : "고객 정보 수정"}</h2>
					<label>
						고객 이름
						<input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 김민지" maxLength={100} />
					</label>
					<label>
						메모
						<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="예: 9월 자료 요청 예정" maxLength={500} rows={4} />
					</label>
					<div className="form-actions">
						<button className="primary-button" type="submit" disabled={isSaving}>
							{isSaving ? "저장 중..." : editingId === null ? "고객 추가" : "수정 저장"}
						</button>
						{editingId !== null && <button className="text-button" type="button" onClick={resetForm}>취소</button>}
					</div>
				</form>

				<section className="customer-list">
					<div className="list-heading">
						<div>
							<h2>고객 목록</h2>
							<p>{isLoading ? "불러오는 중..." : `${customers.length}명`}</p>
						</div>
						<input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="고객 이름 검색" aria-label="고객 이름 검색" />
					</div>
					<section className="import-section" aria-label="파일로 고객 추가">
						<h3>파일로 고객 추가</h3>
						<p>고객과 자료를 한 줄에 함께 적으세요. 같은 고객명은 기존 고객의 자료 목록에 추가됩니다.</p>
						<div className="import-actions"><label className="import-file-input">파일 선택<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void previewImportFile(event)} /></label><button className="import-file-input" type="button" onClick={downloadImportTemplate}>템플릿 다운로드</button></div>
						{importFileName && <p className="import-file-name">선택한 파일: {importFileName}</p>}
						{importIssues.length > 0 && <ul className="import-issues">{importIssues.map((issue, index) => <li key={`${issue.row}-${index}`}>{issue.row > 0 ? `${issue.row}번째 줄: ` : ""}{issue.message}</li>)}</ul>}
						{importRows.length > 0 && <div className="import-preview"><h4>고객 {importCustomerCount}명 · 자료 요청 {importMaterialRequestCount}건</h4><ul>{importRows.map((row, index) => <li key={`${row.customer_name}-${row.material_request?.name}-${index}`}><strong>{row.customer_name}</strong><span>{row.material_request ? `${row.material_request.name} · ${row.material_request.due_date} · ${row.material_request.status === "not_requested" ? "요청 전" : row.material_request.status === "requested" ? "요청함" : "제출 완료"}` : "고객만 추가"}</span></li>)}</ul><button className="primary-button" type="button" onClick={() => void importCustomersFromFile()} disabled={isImportSaving}>{isImportSaving ? "추가 중..." : "고객과 자료 추가하기"}</button></div>}
						{importMessage && <p className="import-message">{importMessage}</p>}
					</section>

					{error && <p className="error-message" role="alert">{error}</p>}
					{!isLoading && customers.length === 0 && <p className="empty-message">{search ? "검색 결과가 없습니다." : "아직 등록한 고객이 없습니다."}</p>}
					<ul className="customer-items">
						{customers.map((customer) => (
							<li key={customer.id} className={selectedCustomer?.id === customer.id ? "selected-customer" : undefined}>
								<div>
									<strong>{customer.name}</strong>
									<p>{customer.note || "메모 없음"}</p>
									<time dateTime={customer.created_at}>등록일 {new Date(customer.created_at).toLocaleDateString("ko-KR")}</time>
								</div>
								<div className="item-actions">
									<button className="text-button" type="button" onClick={() => selectCustomer(customer)}>자료 관리</button>
									<button className="text-button" type="button" onClick={() => startEditing(customer)}>수정</button>
									<button className="delete-button" type="button" onClick={() => void deleteCustomer(customer)}>삭제</button>
								</div>
							</li>
						))}
					</ul>
				</section>
			</section>

			<section className="request-section" aria-label="자료 요청 관리">
				{selectedCustomer ? (
					<>
						<div className="request-heading">
							<div>
								<p className="eyebrow">선택한 고객</p>
								<h2>{selectedCustomer.name} 자료 요청</h2>
							</div>
							<button className="text-button" type="button" onClick={() => { setSelectedCustomer(null); setMaterialRequests([]); resetRequestForm(); }}>선택 해제</button>
						</div>
						<div className="request-layout">
							<form className="customer-form" onSubmit={saveMaterialRequest}>
								<h2>{editingRequestId === null ? "자료 요청 추가" : "자료 요청 수정"}</h2>
								<label>자료 이름<input value={requestName} onChange={(event) => setRequestName(event.target.value)} placeholder="예: 급여대장" maxLength={100} /></label>
								<label>메모<textarea value={requestNote} onChange={(event) => setRequestNote(event.target.value)} placeholder="예: 8월분 자료" maxLength={500} rows={3} /></label>
								<label>마감일<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
								<div className="form-actions">
									<button className="primary-button" type="submit" disabled={isRequestSaving}>{isRequestSaving ? "저장 중..." : editingRequestId === null ? "자료 요청 추가" : "수정 저장"}</button>
									{editingRequestId !== null && <button className="text-button" type="button" onClick={resetRequestForm}>취소</button>}
								</div>
							</form>
							<div className="request-list">
								{isRequestLoading ? <p className="empty-message">불러오는 중...</p> : materialRequests.length === 0 ? <p className="empty-message">아직 등록한 자료 요청이 없습니다.</p> : (
									<ul className="customer-items">
										{materialRequests.map((materialRequest) => (
											<li key={materialRequest.id}>
												<div><strong>{materialRequest.name}</strong><p>{materialRequest.note || "메모 없음"}</p><time>마감일 {new Date(`${materialRequest.due_date}T00:00:00`).toLocaleDateString("ko-KR")}</time><b className={`deadline-status ${deadlineInfo(materialRequest).type}`}>{deadlineInfo(materialRequest).text}</b>{materialRequest.submitted_at && <time className="submitted-date">제출일 {new Date(materialRequest.submitted_at).toLocaleDateString("ko-KR")}</time>}</div>
												<div className="item-actions"><button className="text-button" type="button" onClick={() => startEditingMaterialRequest(materialRequest)}>수정</button><button className="delete-button" type="button" onClick={() => void deleteMaterialRequest(materialRequest)}>삭제</button></div>
												<label className="status-control">제출 상태<select value={materialRequest.status} onChange={(event) => void updateMaterialRequestStatus(materialRequest, event.target.value as MaterialRequest["status"])} disabled={changingStatusId === materialRequest.id}><option value="not_requested">요청 전</option><option value="requested">요청함</option><option value="submitted">제출 완료</option></select></label>
											</li>
										))}
									</ul>
								)}
							</div>
						</div>
					</>
				) : <p className="empty-message">고객 목록에서 자료 관리를 눌러 고객을 선택해 주세요.</p>}
			</section>
		</main>
	);
}

export default App;
