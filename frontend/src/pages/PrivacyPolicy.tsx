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
          <a href="mailto:ryby@dom3k.pl">ryby@dom3k.pl</a>.
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
            Nie udostępniamy danych podmiotom trzecim w celach marketingowych,
            analitycznych ani handlowych. Dane są udostępniane wyłącznie
            podmiotom przetwarzającym niezbędnym do działania aplikacji
            (Cloudflare — patrz sekcja 7) oraz na żądanie uprawnionych organów.
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
        <h3>6. Gdzie przechowywane są dane</h3>
        <p>
          <strong>Baza danych i aplikacja</strong> — serwer VPS zlokalizowany
          w Helsinkach, Finlandia (Hetzner, operator: mikr.us). Na serwerze
          przechowywane są: dane kont, logi serwera oraz — w przypadku braku
          konfiguracji R2 — zdjęcia ryb i awatary.
        </p>
        <p>
          <strong>Zdjęcia (R2)</strong> — jeśli skonfigurowano, zdjęcia ryb i
          awatary przechowywane są w Cloudflare R2 (object storage), którego
          dane domyślnie replikowane są w ramach Unii Europejskiej. Cloudflare
          przetwarza te dane jako podmiot przetwarzający (Data Processor) zgodnie
          z RODO.
        </p>
        <p>
          Logi serwera (zapisywane przez systemd journal) zawierają adresy IP
          przy każdym żądaniu HTTP oraz przy zdarzeniach uwierzytelniania.
          Są automatycznie usuwane po <strong>7 dniach</strong> (MaxRetentionSec=7day)
          lub po przekroczeniu 50 MB, w zależności co nastąpi pierwsze.
        </p>
      </section>

      <section class="privacy-section">
        <h3>7. Cloudflare — DNS, tunel i CDN</h3>
        <p>
          Aplikacja korzysta z infrastruktury Cloudflare jako podmiotu
          przetwarzającego dane (Data Processor). Oto co Cloudflare widzi
          i dlaczego:
        </p>
        <ul>
          <li>
            <strong>Proxy DNS (ryby.dom3k.pl)</strong> — domena używa
            proxy Cloudflare (pomarańczowa chmurka). Cloudflare terminuje TLS
            na swoim brzegu sieci, a następnie przekazuje odszyfrowany ruch
            przez tunel cloudflared do serwera (localhost:80).{' '}
            <strong>Cloudflare widzi pełną treść ruchu HTTP</strong> — w tym
            tokeny JWT, nazwy użytkowników, dane ryb i przesyłane zdjęcia.
            Jest to nieodłączna cecha działania reverse proxy/CDN i ochrony
            przed DDoS.
          </li>
          <li>
            <strong>Tunel cloudflared</strong> — szyfrowane połączenie między
            serwerem VPS a siecią Cloudflare. Ruch z{' '}
            <code>ryby.dom3k.pl</code> jest kierowany przez tunel do serwera
            (HTTP localhost:80), gdzie nginx przekazuje go do aplikacji.
            Tunel publikuje również <code>m.dom3k.pl</code> (ta sama aplikacja)
            — dane przetwarzane są identycznie jak dla głównej domeny.
          </li>
          <li>
            <strong>Cloudflare R2</strong> — opisane w sekcji 6. Przechowuje
            zdjęcia jako obiekty.
          </li>
        </ul>
        <p>
          Cloudflare, Inc. (USA) przetwarza dane na podstawie Standardowych
          Klauzul Umownych (SCC) zatwierdzonych przez Komisję Europejską, co
          zapewnia zgodność transferu danych z RODO.
        </p>
      </section>

      <section class="privacy-section">
        <h3>8. Ciasteczka i localStorage</h3>
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
        <h3>9. Kontakt</h3>
        <p>
          W sprawach dotyczących prywatności i danych osobowych prosimy o
          kontakt:{' '}
          <a href="mailto:ryby@dom3k.pl">ryby@dom3k.pl</a>
        </p>
      </section>
    </div>
  );
}
