interface Props {
  onBack: () => void;
}

export function PrivacyPolicyPage({ onBack }: Props) {
  return (
    <div class="page">
      <button class="privacy-back-btn" onClick={onBack}>
        ← Powrót
      </button>

      <h2>Polityka Prywatności</h2>
      <p class="privacy-date"><em>Ostatnia aktualizacja: 6 lipca 2026</em></p>

      <section class="privacy-section">
        <h3>1. Kim jesteśmy</h3>
        <p>
          Aplikacja <strong>Rybaspotting</strong> („Ryby z Dupom”) to
          niekomercyjna, społecznościowa gra polegająca na znajdowaniu i
          kolekcjonowaniu graffiti ryb w Krakowie. Operatorem aplikacji jest
          osoba fizyczna dostępna pod adresem e-mail:{' '}
          <a href="mailto:kontakt@dom3k.pl">kontakt@dom3k.pl</a>.
        </p>
      </section>

      <section class="privacy-section">
        <h3>2. Jakie dane zbieramy</h3>
        <p>Podczas korzystania z aplikacji zbieramy następujące dane:</p>
        <ul>
          <li>
            <strong>Dane konta</strong> — nazwa użytkownika, nazwa wyświetlana,
            zahaszowane hasło (nigdy w postaci jawnej), data utworzenia konta.
          </li>
          <li>
            <strong>Token sesji (JWT)</strong> — przechowywany w localStorage
            przeglądarki, niezbędny do utrzymania zalogowania. Jest to tzw.
            „strictly necessary cookie” — nie wymaga zgody użytkownika.
          </li>
          <li>
            <strong>Spotted ryby</strong> — zdjęcia, współrzędne GPS, wskazówka
            adresowa oraz powiązanie z Twoim kontem.
          </li>
          <li>
            <strong>Kolekcje</strong> — informacja o tym, które ryby zebrałeś/aś.
          </li>
          <li>
            <strong>Zdjęcie profilowe (awatar)</strong> — jeśli zdecydujesz się
            je przesłać.
          </li>
          <li>
            <strong>Adres IP</strong> — zapisywany w logach serwera przy
            rejestracji i logowaniu w celach bezpieczeństwa i debugowania.
          </li>
        </ul>
      </section>

      <section class="privacy-section">
        <h3>3. Czego NIE zbieramy</h3>
        <ul>
          <li>Nie używamy zewnętrznych trackerów ani narzędzi analitycznych.</li>
          <li>Nie wyświetlamy reklam.</li>
          <li>
            Nie udostępniamy danych podmiotom trzecim (chyba że wymaga tego
            prawo).
          </li>
          <li>Nie zbieramy dokładnej lokalizacji w tle.</li>
        </ul>
      </section>

      <section class="privacy-section">
        <h3>4. Podstawa prawna przetwarzania</h3>
        <p>
          Przetwarzamy Twoje dane na podstawie{' '}
          <strong>uzasadnionego interesu</strong> (art. 6 ust. 1 lit. f RODO)
          — umożliwienie działania aplikacji społecznościowej — oraz{' '}
          <strong>wykonania umowy</strong> (art. 6 ust. 1 lit. b RODO) gdy
          zakładasz konto i korzystasz z usługi.
        </p>
      </section>

      <section class="privacy-section">
        <h3>5. Twoje prawa</h3>
        <p>Na mocy RODO przysługują Ci następujące prawa:</p>
        <ul>
          <li>
            <strong>Dostęp do danych</strong> — możesz sprawdzić jakie dane
            przechowujemy (widoczne w profilu).
          </li>
          <li>
            <strong>Sprostowanie</strong> — możesz zmienić nazwę wyświetlaną w
            ustawieniach profilu.
          </li>
          <li>
            <strong>Usunięcie danych („prawo do bycia zapomnianym”)</strong> —
            możesz trwale usunąć swoje konto wraz ze wszystkimi spotted rybami,
            zdjęciami i kolekcjami w ustawieniach profilu (przycisk „Usuń konto
            bezpowrotnie”). Operacja jest nieodwracalna.
          </li>
          <li>
            <strong>Ograniczenie przetwarzania</strong> — możesz przestać
            korzystać z aplikacji w dowolnym momencie.
          </li>
          <li>
            <strong>Skarga</strong> — masz prawo wnieść skargę do Prezesa Urzędu
            Ochrony Danych Osobowych (PUODO).
          </li>
        </ul>
      </section>

      <section class="privacy-section">
        <h3>6. Przechowywanie danych</h3>
        <p>
          Dane przechowywane są na serwerze VPS zlokalizowanym na terenie Unii
          Europejskiej (Niemcy, mikr.us). Zdjęcia przechowywane są na dysku
          serwera. Logi serwera są przechowywane przez ograniczony czas i
          usuwane automatycznie.
        </p>
      </section>

      <section class="privacy-section">
        <h3>7. Ciasteczka i localStorage</h3>
        <p>
          Aplikacja używa wyłącznie <strong>localStorage</strong> przeglądarki do
          przechowywania:
        </p>
        <ul>
          <li>Tokenu JWT (niezbędny do działania — sesja logowania)</li>
          <li>Preferencji trybu jasnego/ciemnego</li>
          <li>Informacji o zamknięciu banera prywatności</li>
        </ul>
        <p>
          Żadne z powyższych nie służy do śledzenia użytkownika poza aplikacją.
        </p>
      </section>

      <section class="privacy-section">
        <h3>8. Kontakt</h3>
        <p>
          W sprawach dotyczących prywatności i danych osobowych prosimy o
          kontakt:{' '}
          <a href="mailto:kontakt@dom3k.pl">kontakt@dom3k.pl</a>
        </p>
      </section>
    </div>
  );
}
