import { useEffect, useState, type FormEvent } from "react";
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

	function selectCustomer(customer: Customer) {
		setSelectedCustomer(customer);
		resetRequestForm();
		void loadMaterialRequests(customer.id);
	}

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
			await loadCustomers();
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
			await loadCustomers();
			await loadDeadlineRequests();
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
			await Promise.all([loadMaterialRequests(selectedCustomer.id), loadDeadlineRequests()]);
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
			await Promise.all([loadMaterialRequests(selectedCustomer.id), loadDeadlineRequests()]);
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

			await Promise.all([loadMaterialRequests(selectedCustomer.id), loadDeadlineRequests()]);
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
