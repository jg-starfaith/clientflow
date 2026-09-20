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
type AppView = "dashboard" | "customers";

type DashboardCustomer = Customer & {
	status: Exclude<DashboardFilter, "all">;
	total_requests: number;
	submitted_requests: number;
	nearest_due_date: string | null;
	overdue_days: number | null;
	has_due_today: boolean;
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

type RequestTemplateItem = {
	id: number;
	template_id: number;
	name: string;
	note: string;
};

type RequestTemplate = {
	id: number;
	name: string;
	items: RequestTemplateItem[];
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
	const [dashboardCustomerPage, setDashboardCustomerPage] = useState(1);
	const [deadlinePage, setDeadlinePage] = useState(1);
	const [appView, setAppView] = useState<AppView>("dashboard");
	const [showCustomerForm, setShowCustomerForm] = useState(false);
	const [showImport, setShowImport] = useState(false);
	const [showRequestForm, setShowRequestForm] = useState(false);
	const [showTemplates, setShowTemplates] = useState(false);
	const [requestSearch, setRequestSearch] = useState("");
	const [importFileName, setImportFileName] = useState("");
	const [importRows, setImportRows] = useState<ImportRow[]>([]);
	const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
	const [importMessage, setImportMessage] = useState("");
	const [isImportSaving, setIsImportSaving] = useState(false);
	const [aiDraft, setAiDraft] = useState("");
	const [aiMessage, setAiMessage] = useState("");
	const [isAiGenerating, setIsAiGenerating] = useState(false);
	const [requestTemplates, setRequestTemplates] = useState<RequestTemplate[]>([]);
	const [isTemplateLoading, setIsTemplateLoading] = useState(true);
	const [templateName, setTemplateName] = useState("");
	const [templateItemName, setTemplateItemName] = useState("");
	const [templateItemNote, setTemplateItemNote] = useState("");
	const [templateDraftItems, setTemplateDraftItems] = useState<{ name: string; note: string }[]>([]);
	const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
	const [templateDueDate, setTemplateDueDate] = useState("");
	const [isTemplateSaving, setIsTemplateSaving] = useState(false);
	const [templateMessage, setTemplateMessage] = useState("");

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

	useEffect(() => {
		void loadRequestTemplates();
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

	async function loadRequestTemplates() {
		setIsTemplateLoading(true);
		try {
			const response = await fetch("/api/request-templates");
			if (!response.ok) throw new Error("자료 요청 묶음을 불러오지 못했습니다.");
			const data = (await response.json()) as { templates: RequestTemplate[] };
			setRequestTemplates(data.templates);
		} catch (caughtError) {
			setTemplateMessage(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		} finally {
			setIsTemplateLoading(false);
		}
	}

	function selectCustomer(customer: Customer) {
		setSelectedCustomer(customer);
		resetRequestForm();
		setAiDraft("");
		setAiMessage("");
		setRequestSearch("");
		void loadMaterialRequests(customer.id);
	}

	function openCustomerWorkspace(customer: Customer) {
		selectCustomer(customer);
		setAppView("customers");
	}

	async function openCustomerWorkspaceById(customerId: number, customerName: string) {
		const loadedCustomer = customers.find((customer) => customer.id === customerId);
		if (loadedCustomer) {
			openCustomerWorkspace(loadedCustomer);
			return;
		}

		try {
			const response = await fetch(`/api/customers?search=${encodeURIComponent(customerName)}`);
			const data = (await response.json()) as { customers?: Customer[] };
			const customer = data.customers?.find((item) => item.id === customerId);
			if (customer) openCustomerWorkspace(customer);
		} catch {
			setError("고객 정보를 불러오지 못했습니다.");
		}
	}

	async function generateAiRequestMessage() {
		if (!selectedCustomer) return;

		setIsAiGenerating(true);
		setAiMessage("");
		try {
			const response = await fetch(`/api/customers/${selectedCustomer.id}/ai-request-message`, { method: "POST" });
			const data = (await response.json()) as { message?: string; error?: string };
			if (!response.ok || !data.message) throw new Error(data.error ?? "AI 요청문을 만들지 못했습니다.");
			setAiDraft(data.message);
		} catch (caughtError) {
			setAiMessage(caughtError instanceof Error ? caughtError.message : "AI 요청문을 만들지 못했습니다.");
		} finally {
			setIsAiGenerating(false);
		}
	}

	async function copyAiDraft() {
		try {
			await navigator.clipboard.writeText(aiDraft);
			setAiMessage("요청문을 복사했습니다.");
		} catch {
			setAiMessage("복사하지 못했습니다. 요청문을 직접 선택해 복사해 주세요.");
		}
	}

	function addTemplateDraftItem() {
		if (!templateItemName.trim()) {
			setTemplateMessage("자료 이름을 입력해 주세요.");
			return;
		}
		setTemplateDraftItems((items) => [...items, { name: templateItemName.trim(), note: templateItemNote.trim() }]);
		setTemplateItemName("");
		setTemplateItemNote("");
		setTemplateMessage("");
	}

	function removeTemplateDraftItem(index: number) {
		setTemplateDraftItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
	}

	function resetTemplateForm() {
		setTemplateName("");
		setTemplateItemName("");
		setTemplateItemNote("");
		setTemplateDraftItems([]);
		setEditingTemplateId(null);
	}

	function startEditingRequestTemplate(template: RequestTemplate) {
		setTemplateName(template.name);
		setTemplateDraftItems(template.items.map((item) => ({ name: item.name, note: item.note })));
		setEditingTemplateId(template.id);
		setTemplateMessage("");
	}

	async function saveRequestTemplate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!templateName.trim()) {
			setTemplateMessage("묶음 이름을 입력해 주세요.");
			return;
		}
		if (templateDraftItems.length === 0) {
			setTemplateMessage("묶음에 넣을 자료를 추가해 주세요.");
			return;
		}

		setIsTemplateSaving(true);
		setTemplateMessage("");
		try {
			const response = await fetch(editingTemplateId === null ? "/api/request-templates" : `/api/request-templates/${editingTemplateId}`, {
				method: editingTemplateId === null ? "POST" : "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: templateName, items: templateDraftItems }),
			});
			const data = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(data.error ?? "자료 요청 묶음을 저장하지 못했습니다.");
			const wasEditing = editingTemplateId !== null;
			resetTemplateForm();
			setTemplateMessage(wasEditing ? "자료 요청 묶음을 수정했습니다." : "자료 요청 묶음을 저장했습니다.");
			await loadRequestTemplates();
		} catch (caughtError) {
			setTemplateMessage(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		} finally {
			setIsTemplateSaving(false);
		}
	}

	async function deleteRequestTemplate(template: RequestTemplate) {
		if (!window.confirm(`'${template.name}' 묶음을 삭제할까요?`)) return;

		setTemplateMessage("");
		try {
			const response = await fetch(`/api/request-templates/${template.id}`, { method: "DELETE" });
			if (!response.ok) throw new Error("자료 요청 묶음을 삭제하지 못했습니다.");
			setTemplateMessage("자료 요청 묶음을 삭제했습니다.");
			await loadRequestTemplates();
		} catch (caughtError) {
			setTemplateMessage(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		}
	}

	async function applyRequestTemplate(template: RequestTemplate) {
		if (!selectedCustomer) {
			setTemplateMessage("먼저 고객을 선택해 주세요.");
			return;
		}
		if (!templateDueDate) {
			setTemplateMessage("적용할 마감일을 입력해 주세요.");
			return;
		}

		setIsTemplateSaving(true);
		setTemplateMessage("");
		try {
			const response = await fetch(`/api/customers/${selectedCustomer.id}/request-templates/${template.id}/apply`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ due_date: templateDueDate }),
			});
			const data = (await response.json()) as { created_count?: number; error?: string };
			if (!response.ok) throw new Error(data.error ?? "자료 요청 묶음을 적용하지 못했습니다.");
			setAiDraft("");
			setAiMessage("");
			setTemplateMessage(`${data.created_count ?? template.items.length}개 자료 요청을 ${selectedCustomer.name}에 추가했습니다.`);
			await Promise.all([loadMaterialRequests(selectedCustomer.id), loadDeadlineRequests(), loadDashboard()]);
		} catch (caughtError) {
			setTemplateMessage(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		} finally {
			setIsTemplateSaving(false);
		}
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
		in_progress: "진행",
		overdue: "확인",
		completed: "완료",
	};
	const importCustomerCount = new Set(importRows.map((row) => row.customer_name)).size;
	const importMaterialRequestCount = importRows.filter((row) => row.material_request !== null).length;
	const hasUnsubmittedRequests = materialRequests.some((materialRequest) => materialRequest.status !== "submitted");
	const visibleMaterialRequests = materialRequests.filter((materialRequest) => materialRequest.name.toLowerCase().includes(requestSearch.trim().toLowerCase()));

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
			setShowCustomerForm(false);
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
		setShowCustomerForm(true);
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
			setShowRequestForm(false);
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
		setShowRequestForm(true);
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
	const dashboardPageSize = 10;
	const dashboardCustomerTotalPages = Math.max(1, Math.ceil(visibleDashboardCustomers.length / dashboardPageSize));
	const deadlineTotalPages = Math.max(1, Math.ceil(visibleDeadlineRequests.length / dashboardPageSize));
	const currentDashboardCustomerPage = Math.min(dashboardCustomerPage, dashboardCustomerTotalPages);
	const currentDeadlinePage = Math.min(deadlinePage, deadlineTotalPages);
	const pagedDashboardCustomers = visibleDashboardCustomers.slice((currentDashboardCustomerPage - 1) * dashboardPageSize, currentDashboardCustomerPage * dashboardPageSize);
	const pagedDeadlineRequests = visibleDeadlineRequests.slice((currentDeadlinePage - 1) * dashboardPageSize, currentDeadlinePage * dashboardPageSize);

	return (
		<main className="app-shell">
			<header className="app-header">
				<button className="brand" type="button" onClick={() => setAppView("dashboard")}>ClientFlow</button>
				<nav aria-label="주요 메뉴">
					<button className={appView === "dashboard" ? "nav-button active" : "nav-button"} type="button" onClick={() => setAppView("dashboard")}>대시보드</button>
					<button className={appView === "customers" ? "nav-button active" : "nav-button"} type="button" onClick={() => setAppView("customers")}>고객 관리</button>
				</nav>
			</header>

			{appView === "dashboard" && <div className="dashboard-layout">
			<section className="dashboard-section" aria-label="고객 현황">
				<div className="dashboard-heading"><h2>고객 현황</h2></div>
				{isDashboardLoading || !dashboardSummary ? <p className="empty-message">불러오는 중...</p> : (
					<>
						<div className="summary-links">
							<button className={dashboardFilter === "all" ? "active" : ""} type="button" onClick={() => { setDashboardFilter("all"); setDashboardCustomerPage(1); }}><span>전체</span><strong>{dashboardSummary.total_customers}</strong></button>
							<button className={dashboardFilter === "in_progress" ? "active" : ""} type="button" onClick={() => { setDashboardFilter("in_progress"); setDashboardCustomerPage(1); }}><span>진행</span><strong>{dashboardSummary.in_progress_customers}</strong></button>
							<button className={`overdue-summary ${dashboardFilter === "overdue" ? "active" : ""}`} type="button" onClick={() => { setDashboardFilter("overdue"); setDashboardCustomerPage(1); }}><span>확인</span><strong>{dashboardSummary.overdue_customers}</strong></button>
							<button className={dashboardFilter === "completed" ? "active" : ""} type="button" onClick={() => { setDashboardFilter("completed"); setDashboardCustomerPage(1); }}><span>완료</span><strong>{dashboardSummary.completed_customers}</strong></button>
						</div>
						<div className="dashboard-customer-list">
							<div className="table-head dashboard-table"><span>고객명</span><span>진행률</span><span>안내</span><span>자료 보기</span></div>
							{visibleDashboardCustomers.length === 0 ? <p>해당하는 고객이 없습니다.</p> : <><ul>{pagedDashboardCustomers.map((customer) => { const notice = customer.status === "overdue" ? "마감일 확인 필요" : customer.has_due_today ? "오늘 마감" : ""; return <li className="dashboard-table" key={customer.id}><strong>{customer.name}</strong><span>{customer.submitted_requests} / {customer.total_requests}</span><span className={notice ? "deadline-urgent" : ""}>{notice}</span><button className="link-button" type="button" onClick={() => openCustomerWorkspace(customer)}>자료 보기</button></li>; })}</ul><div className="dashboard-pagination"><button type="button" onClick={() => setDashboardCustomerPage((page) => Math.max(1, page - 1))} disabled={currentDashboardCustomerPage === 1}>이전</button><span>{currentDashboardCustomerPage} / {dashboardCustomerTotalPages}</span><button type="button" onClick={() => setDashboardCustomerPage((page) => Math.min(dashboardCustomerTotalPages, page + 1))} disabled={currentDashboardCustomerPage === dashboardCustomerTotalPages}>다음</button></div></>}
						</div>
					</>
				)}
			</section>

			<section className="deadline-section" aria-label="자료 현황">
				<div className="deadline-heading">
					<h2>자료 현황</h2>
					<div className="deadline-tabs">
						<button className={deadlineView === "today" ? "deadline-tab active" : "deadline-tab"} type="button" onClick={() => { setDeadlineView("today"); setDeadlinePage(1); }}>오늘 마감 {todayDeadlineRequests.length}</button>
						<button className={deadlineView === "overdue" ? "deadline-tab active urgent-tab" : "deadline-tab urgent-tab"} type="button" onClick={() => { setDeadlineView("overdue"); setDeadlinePage(1); }}>지연 {overdueRequests.length}</button>
					</div>
				</div>
				{isDeadlineLoading ? <p className="empty-message">불러오는 중...</p> : visibleDeadlineRequests.length === 0 ? <p className="empty-message">{deadlineView === "today" ? "오늘 마감인 자료가 없습니다." : "지연된 자료가 없습니다."}</p> : (
					<><ul className="deadline-items dashboard-material-table">
						<li className="table-head"><span>고객명</span><span>자료명</span><span>안내</span><span>자료 보기</span></li>
						{pagedDeadlineRequests.map((materialRequest) => <li key={materialRequest.id}><strong>{materialRequest.customer_name}</strong><span>{materialRequest.name}</span><b className="deadline-urgent">{deadlineInfo(materialRequest, today).text}</b><button className="link-button" type="button" onClick={() => void openCustomerWorkspaceById(materialRequest.customer_id, materialRequest.customer_name)}>자료 보기</button></li>)}
					</ul>
					<div className="dashboard-pagination"><button type="button" onClick={() => setDeadlinePage((page) => Math.max(1, page - 1))} disabled={currentDeadlinePage === 1}>이전</button><span>{currentDeadlinePage} / {deadlineTotalPages}</span><button type="button" onClick={() => setDeadlinePage((page) => Math.min(deadlineTotalPages, page + 1))} disabled={currentDeadlinePage === deadlineTotalPages}>다음</button></div></>
				)}
			</section>
			</div>}

			{appView === "customers" && <section className="workspace" aria-label="고객 관리">
				<aside className="customer-panel">
					<div className="list-heading"><h2>고객 목록</h2></div>
					<div className="panel-actions"><button className="primary-button" type="button" onClick={() => { resetForm(); setShowCustomerForm(true); }}>고객 추가</button><button className="primary-button" type="button" onClick={() => setShowImport((value) => !value)}>파일로 추가</button><button className="text-button" type="button" onClick={downloadImportTemplate}>CSV 템플릿 다운로드</button></div>
					{showCustomerForm && <form className="customer-form compact-form" onSubmit={saveCustomer}>
					<h2>{editingId === null ? "고객 추가" : "고객 수정"}</h2>
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
							{isSaving ? "저장 중..." : editingId === null ? "추가" : "수정"}
						</button>
						<button className="text-button" type="button" onClick={() => { resetForm(); setShowCustomerForm(false); }}>취소</button>
					</div>
					</form>}
					<div className="customer-search-row"><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="고객 이름 검색" aria-label="고객 이름 검색" /></div>
					{showImport && <section className="import-section" aria-label="파일로 고객 추가">
						<h3>파일로 고객 추가</h3>
						<p>고객과 자료를 한 줄에 함께 적으세요. 같은 고객명은 기존 고객의 자료 목록에 추가됩니다.</p>
						<div className="import-actions"><label className="import-file-input">파일 선택<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void previewImportFile(event)} /></label><button className="import-file-input" type="button" onClick={downloadImportTemplate}>템플릿 다운로드</button></div>
						{importFileName && <p className="import-file-name">선택한 파일: {importFileName}</p>}
						{importIssues.length > 0 && <ul className="import-issues">{importIssues.map((issue, index) => <li key={`${issue.row}-${index}`}>{issue.row > 0 ? `${issue.row}번째 줄: ` : ""}{issue.message}</li>)}</ul>}
						{importRows.length > 0 && <div className="import-preview"><h4>고객 {importCustomerCount}명 · 자료 요청 {importMaterialRequestCount}건</h4><ul>{importRows.map((row, index) => <li key={`${row.customer_name}-${row.material_request?.name}-${index}`}><strong>{row.customer_name}</strong><span>{row.material_request ? `${row.material_request.name} · ${row.material_request.due_date} · ${row.material_request.status === "not_requested" ? "요청 전" : row.material_request.status === "requested" ? "요청함" : "제출 완료"}` : "고객만 추가"}</span></li>)}</ul><button className="primary-button" type="button" onClick={() => void importCustomersFromFile()} disabled={isImportSaving}>{isImportSaving ? "추가 중..." : "고객과 자료 추가하기"}</button></div>}
						{importMessage && <p className="import-message">{importMessage}</p>}
					</section>}

					{error && <p className="error-message" role="alert">{error}</p>}
					{!isLoading && customers.length === 0 && <p className="empty-message">{search ? "검색 결과가 없습니다." : "아직 등록한 고객이 없습니다."}</p>}
					<ul className="customer-items customer-sidebar-items">
						{customers.map((customer) => (
							<li key={customer.id} className={selectedCustomer?.id === customer.id ? "selected-customer" : undefined}>
								<div className="item-actions"><button className="customer-name-button" type="button" onClick={() => selectCustomer(customer)}>{customer.name}</button><button className="small-button" type="button" onClick={() => startEditing(customer)}>수정</button><button className="small-delete-button" type="button" onClick={() => void deleteCustomer(customer)}>삭제</button></div>
							</li>
						))}
					</ul>
				</aside>
				<section className="request-section" aria-label="자료 요청 관리">
					<h2 className="detail-heading">고객 상세</h2>
				{selectedCustomer ? (
					<>
						<div className="request-heading">
							<div className="customer-title"><h2>{selectedCustomer.name}</h2><button className="small-button" type="button" onClick={() => startEditing(selectedCustomer)}>수정</button></div>
						</div>
						<p className="customer-detail-note">메모: {selectedCustomer.note || "없음"}</p>
						{!hasUnsubmittedRequests && !isRequestLoading && <p className="ai-guide">요청할 미제출 자료가 없습니다.</p>}
						{aiDraft && <section className="ai-draft" aria-label="AI 요청문 초안"><h3>AI 요청문 초안</h3><textarea value={aiDraft} onChange={(event) => setAiDraft(event.target.value)} rows={7} aria-label="AI 요청문 초안" /><button className="text-button" type="button" onClick={() => void copyAiDraft()}>복사하기</button></section>}
						{aiMessage && <p className={aiDraft && aiMessage === "요청문을 복사했습니다." ? "ai-message" : "error-message"}>{aiMessage}</p>}
						<div className="materials-heading"><h3>자료 목록</h3><div className="material-actions"><button className="primary-button" type="button" onClick={() => { resetRequestForm(); setShowRequestForm(true); }}>추가</button><button className="primary-button bulk-add-button" type="button" onClick={() => setShowTemplates((value) => !value)}>일괄 추가</button></div></div>
						<div className="request-search-row"><input className="search-input" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="자료 이름 검색" aria-label="자료 이름 검색" /><button className="text-button ai-button" type="button" onClick={() => void generateAiRequestMessage()} disabled={!hasUnsubmittedRequests || isAiGenerating}>{isAiGenerating ? "AI 요청문 생성 중..." : "AI 요청문 만들기"}</button></div>
						{showRequestForm && <form className="customer-form compact-form material-form" onSubmit={saveMaterialRequest}>
								<h2>{editingRequestId === null ? "자료 추가" : "자료 수정"}</h2>
								<label>자료 이름<input value={requestName} onChange={(event) => setRequestName(event.target.value)} placeholder="예: 급여대장" maxLength={100} /></label>
								<label>메모<textarea value={requestNote} onChange={(event) => setRequestNote(event.target.value)} placeholder="예: 8월분 자료" maxLength={500} rows={3} /></label>
								<label>마감일<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
								<div className="form-actions">
									<button className="primary-button" type="submit" disabled={isRequestSaving}>{isRequestSaving ? "저장 중..." : editingRequestId === null ? "추가" : "수정"}</button>
									<button className="text-button" type="button" onClick={() => { resetRequestForm(); setShowRequestForm(false); }}>취소</button>
								</div>
							</form>}
							<div className="request-list">
								{isRequestLoading ? <p className="empty-message">불러오는 중...</p> : materialRequests.length === 0 ? <p className="empty-message">아직 등록한 자료 요청이 없습니다.</p> : visibleMaterialRequests.length === 0 ? <p className="empty-message">검색 결과가 없습니다.</p> : (
									<ul className="customer-items">
										{visibleMaterialRequests.map((materialRequest) => (
											<li key={materialRequest.id}>
												<div className="material-details"><div className="material-title"><strong>{materialRequest.name}</strong></div><div className="material-item-actions"><button className="small-button" type="button" onClick={() => startEditingMaterialRequest(materialRequest)}>수정</button><button className="small-delete-button" type="button" onClick={() => void deleteMaterialRequest(materialRequest)}>삭제</button></div><p>{materialRequest.note || "메모 없음"}</p><div className="material-meta"><time>마감일 {new Date(`${materialRequest.due_date}T00:00:00`).toLocaleDateString("ko-KR")}</time></div><div className="material-footer"><div>{materialRequest.status !== "submitted" && <b className={`deadline-status ${deadlineInfo(materialRequest).type}`}>{deadlineInfo(materialRequest).text}</b>}{materialRequest.submitted_at && <time className="submitted-date">제출일 {new Date(materialRequest.submitted_at).toLocaleDateString("ko-KR")}</time>}</div><label className="status-control"><select className={`status-select ${materialRequest.status}`} aria-label={`${materialRequest.name} 제출 상태`} value={materialRequest.status} onChange={(event) => void updateMaterialRequestStatus(materialRequest, event.target.value as MaterialRequest["status"])} disabled={changingStatusId === materialRequest.id}><option value="not_requested">요청 전</option><option value="requested">요청함</option><option value="submitted">제출 완료</option></select></label></div></div>
											</li>
										))}
									</ul>
								)}
							</div>
					</>
				) : <p className="empty-message">고객 목록에서 자료 관리를 눌러 고객을 선택해 주세요.</p>}
				</section>
				{showTemplates && <section className="template-section" aria-label="자료 일괄 등록">
				<div className="template-heading"><div><p className="eyebrow">반복 업무</p><h2>자료 일괄 등록</h2><p className="template-description">자주 쓰이는 자료들을 한 카테고리로 묶어 일괄 등록</p></div></div>
				<div className="template-layout">
					<form className="customer-form" onSubmit={saveRequestTemplate}>
						<h3>{editingTemplateId === null ? "카테고리" : "카테고리 수정"}</h3>
						<label>카테고리 이름<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="예: 월간 세무 자료" maxLength={100} /></label>
						<div className="template-item-form">
							<label>자료 이름<input value={templateItemName} onChange={(event) => setTemplateItemName(event.target.value)} placeholder="예: 급여대장" maxLength={100} /></label>
							<label>메모<input value={templateItemNote} onChange={(event) => setTemplateItemNote(event.target.value)} placeholder="예: 8월분" maxLength={500} /></label>
						</div>
						{templateDraftItems.length > 0 && <ul className="template-draft-items">{templateDraftItems.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}{item.note && ` · ${item.note}`}</span><button className="delete-button" type="button" onClick={() => removeTemplateDraftItem(index)}>빼기</button></li>)}</ul>}
						<div className="template-form-footer"><button className="text-button" type="button" onClick={addTemplateDraftItem}>자료 넣기</button><div className="form-actions"><button className="primary-button" type="submit" disabled={isTemplateSaving}>{isTemplateSaving ? "저장 중..." : editingTemplateId === null ? "저장" : "수정"}</button>{editingTemplateId !== null && <button className="text-button" type="button" onClick={resetTemplateForm}>취소</button>}</div></div>
					</form>
					<div className="template-list">
						<label>적용할 마감일<input type="date" value={templateDueDate} onChange={(event) => setTemplateDueDate(event.target.value)} /></label>
						{isTemplateLoading ? <p className="empty-message">불러오는 중...</p> : requestTemplates.length === 0 ? <p className="empty-message">아직 저장한 자료 요청 묶음이 없습니다.</p> : <ul>{requestTemplates.map((template) => <li key={template.id}><div><strong>{template.name}</strong><p>{template.items.map((item) => item.note ? `${item.name} (${item.note})` : item.name).join(" · ")}</p></div><div className="item-actions"><button className="primary-button" type="button" onClick={() => void applyRequestTemplate(template)} disabled={!selectedCustomer || isTemplateSaving}>적용</button><button className="text-button" type="button" onClick={() => startEditingRequestTemplate(template)} disabled={isTemplateSaving}>수정</button><button className="delete-button" type="button" onClick={() => void deleteRequestTemplate(template)} disabled={isTemplateSaving}>삭제</button></div></li>)}</ul>}
					</div>
				</div>
				{templateMessage && <p className={templateMessage.includes("저장했습니다") || templateMessage.includes("수정했습니다") || templateMessage.includes("추가했습니다") || templateMessage.includes("삭제했습니다") ? "template-message" : "error-message"}>{templateMessage}</p>}
			</section>}
			</section>}
		</main>
	);
}

export default App;
