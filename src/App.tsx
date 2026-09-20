import { useEffect, useState, type FormEvent } from "react";
import "./App.css";

type Customer = {
	id: number;
	name: string;
	note: string;
	created_at: string;
};

function App() {
	const [customers, setCustomers] = useState<Customer[]>([]);
	const [search, setSearch] = useState("");
	const [name, setName] = useState("");
	const [note, setNote] = useState("");
	const [editingId, setEditingId] = useState<number | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

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

	function resetForm() {
		setName("");
		setNote("");
		setEditingId(null);
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
			await loadCustomers();
		} catch (caughtError) {
			setError(caughtError instanceof Error ? caughtError.message : "오류가 발생했습니다.");
		}
	}

	return (
		<main className="app-shell">
			<header>
				<p className="eyebrow">CLIENTFLOW</p>
				<h1>고객 관리</h1>
				<p className="subtitle">고객 이름과 메모를 한곳에서 관리하세요.</p>
			</header>

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
							<li key={customer.id}>
								<div>
									<strong>{customer.name}</strong>
									<p>{customer.note || "메모 없음"}</p>
									<time dateTime={customer.created_at}>등록일 {new Date(customer.created_at).toLocaleDateString("ko-KR")}</time>
								</div>
								<div className="item-actions">
									<button className="text-button" type="button" onClick={() => startEditing(customer)}>수정</button>
									<button className="delete-button" type="button" onClick={() => void deleteCustomer(customer)}>삭제</button>
								</div>
							</li>
						))}
					</ul>
				</section>
			</section>
		</main>
	);
}

export default App;
