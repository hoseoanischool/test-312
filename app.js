// ====== 설정 ======
const ROOMS = ["312호"]; // 312호로 변경

const SEATS_BY_ROOM = {
  "312호": Array.from({ length: 36 }, (_, i) => String(i + 1)), // 좌석 수 36개로 변경
};

// 고정 좌석 설정
const fixedSeatsByRoom = {
  "312호": {}
};

// 야작 금지 인원 설정
const BANNED_USERS = [];

// CSV 복사 기능 관리자 비밀번호
const ADMIN_PASSWORD = '0415405841-2025-2-0821';

const KST_OFFSET_MIN = 9 * 60; // KST +09:00
// ===================

function nowKST() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + KST_OFFSET_MIN * 60000);
}

function pad2(n) { return String(n).padStart(2, "0"); }

function ymdKST(d = nowKST()) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function getWeekDatesKST(base = nowKST()) {
  const dow = base.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMon);
  monday.setHours(0,0,0,0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function labelKOR(d) {
  const w = ["일","월","화","수","목","금","토"][d.getDay()];
  return `${d.getMonth()+1}/${d.getDate()}(${w})`;
}

const $weekTabs = document.getElementById("weekTabs");
const $seatLayout = document.getElementById("seatLayout");
const $modal = document.getElementById("bookingModal");
const $modalTitle = document.getElementById("modalTitle");
const $modalName = document.getElementById("modalName");
const $modalStudentId = document.getElementById("modalStudentId");
const $modalPhone = document.getElementById("modalPhoneNumber");
const $modalSubmitBtn = document.getElementById("modalSubmitBtn");
const $modalCloseBtn = document.getElementById("modalCloseBtn");
const $searchName = document.getElementById("searchName");
const $searchStudentId = document.getElementById("searchStudentId");
const $searchPhone = document.getElementById("searchPhoneNumber");
const $searchBtn = document.getElementById("searchBtn");
const $reservationList = document.getElementById("reservationList");
const $copyCsvBtn = document.getElementById("copyCsvBtn");
const $confirmationModal = document.getElementById("confirmationModal");
const $confirmationMessage = document.getElementById("confirmationMessage");
const $confirmationCloseBtn = document.getElementById("confirmationCloseBtn");
const $openChatLinkContainer = document.getElementById("openChatLinkContainer");

let activeRoom = ROOMS[0];
let activeDate = nowKST();
let activeDateKey = ymdKST(activeDate);
let selectedSeat = null;
let bookingsRef = null;
let bookingsUnsub = null;

function renderWeekTabs() {
  $weekTabs.innerHTML = "";
  const week = getWeekDatesKST(nowKST());
  week.forEach(d => {
    const btn = document.createElement("button");
    const key = ymdKST(d);
    btn.textContent = labelKOR(d);
    btn.className = (key === activeDateKey) ? "active" : "inactive";
    btn.onclick = () => {
      activeDate = new Date(d);
      activeDateKey = ymdKST(activeDate);
      renderWeekTabs();
      attachBookingsListener();
    };
    $weekTabs.appendChild(btn);
  });
}

function renderSeats(snapshotVal) {
  $seatLayout.innerHTML = "";
  const bookings = snapshotVal || {};
  const seatsInRoom = SEATS_BY_ROOM[activeRoom] || [];
  const fixedSeats = fixedSeatsByRoom[activeRoom] || {};
  const todayKey = ymdKST(nowKST());
  const isPastDate = activeDateKey < todayKey;

  $seatLayout.classList.remove("past-date");
  $seatLayout.classList.add(`room-${activeRoom.replace('호', '')}`);
  if (isPastDate) $seatLayout.classList.add("past-date");

  seatsInRoom.forEach(seat => {
    const div = document.createElement("div");
    div.className = "seat";
    div.dataset.seatNumber = seat;
    
    const fixedName = fixedSeats[seat];
    const bookedData = bookings[seat];

    if (fixedName) div.classList.add("fixed");
    if (bookedData) div.classList.add("booked");

    let nameText = fixedName ? fixedName : (bookedData ? bookedData.name : "예약 가능");
    div.innerHTML = `<strong>${seat}</strong><div class="name">${nameText}</div>`;

    if (isPastDate) {
      div.onclick = () => alert("지난 날짜는 예약 불가능 합니다");
    } else if (fixedName) {
      div.onclick = () => alert(`${activeRoom} ${seat}번은 고정 좌석(${fixedName})입니다.`);
    } else if (bookedData) {
      div.onclick = () => alert("이미 예약된 좌석입니다.");
    } else {
      div.title = "예약 가능";
      div.onclick = () => openModal(seat);
    }
    $seatLayout.appendChild(div);
  });
}

function openModal(seat) {
  selectedSeat = seat;
  $modalTitle.textContent = `${activeDateKey} · ${activeRoom} 좌석 ${seat} 예약`;
  $modal.classList.add("show");
  $modalName.focus();
}

function closeModal() {
  $modal.classList.remove("show");
}

async function submitBooking() {
  const name = $modalName.value.trim();
  const sid = $modalStudentId.value.trim();
  const phone = $modalPhone.value.trim();

  if (!selectedSeat || !name || !sid || !phone) {
    alert("이름, 학번, 나만의 4자리 숫자를 모두 입력하세요.");
    return;
  }
  
  const consentRef = db.ref(`consents/${sid}`);
  const consentSnap = await consentRef.get();
  
  if (!consentSnap.exists()) {
    const consentText = `개인 정보 수집 동의...`; // 생략
    if (confirm(consentText)) {
      await consentRef.set({ agreedAt: Date.now() });
    } else {
      alert("동의가 필요합니다.");
      return;
    }
  }

  const bookingsSnap = await db.ref(`bookings/${activeRoom}/${activeDateKey}`).get();
  const bookings = bookingsSnap.val() || {};
  if (Object.values(bookings).some(b => b.studentId === sid)) {
    alert(`이미 이 날짜에 다른 좌석을 예약했습니다.`);
    return;
  }

  const seatRef = db.ref(`bookings/${activeRoom}/${activeDateKey}/${selectedSeat}`);
  await seatRef.set({ name, studentId: sid, phone, createdAt: Date.now() });

  const profileName = `${activeRoom}-${selectedSeat}-${sid}-${name}`;
  closeModal();
  showConfirmationModal(profileName);
}

// ... 나머지 함수들 (searchReservation, copyCsv 등)은 유지 ...

function attachBookingsListener() {
  if (bookingsUnsub) {
    bookingsRef.off("value", bookingsUnsub);
  }
  bookingsRef = db.ref(`bookings/${activeRoom}/${activeDateKey}`);
  bookingsUnsub = bookingsRef.on("value", snap => renderSeats(snap.val()));
}

$modalCloseBtn.onclick = closeModal;
$modalSubmitBtn.onclick = submitBooking;
$searchBtn.onclick = searchReservation;
$copyCsvBtn.onclick = copyCsv;
$confirmationCloseBtn.onclick = closeConfirmationModal;

renderWeekTabs();
attachBookingsListener();