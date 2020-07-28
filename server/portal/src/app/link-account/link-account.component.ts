import { Component, OnInit } from '@angular/core';
import { ApiService } from '../_services/api.service';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-link-account',
  templateUrl: './link-account.component.html',
  styleUrls: ['./link-account.component.scss']
})
export class LinkAccountComponent implements OnInit {
  public parentOrigin: string;
  public authData;
  public authError = false;

  private code?: string;
  private consumerKey?: string;
  private consumerSecret?: string;

  constructor(
    private $api: ApiService,
    private $route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.consumerKey = sessionStorage.consumerKey;
    this.consumerSecret = sessionStorage.consumerSecret;

    this.$route.queryParams.subscribe(params => {
      if (params.consumerKey && params.consumerSecret) {
        sessionStorage.consumerKey = params.consumerKey;
        sessionStorage.consumerSecret = params.consumerSecret;
        this.consumerKey = params.consumerKey;
        this.consumerSecret = params.consumerSecret;
        this.startOAuthFlow();
      } else if (params.code) {
        this.code = params.code;
        this.getToken();
      }
    });
  }

  startOAuthFlow() {
    window.location.href =
      `https://api.honeywell.com/oauth2/authorize` +
        `?response_type=code` +
        `&client_id=${this.consumerKey}` +
        `&redirect_uri=${encodeURIComponent(environment.honeywell.redirectUrl)}`;
  }

  getToken() {
    this.$api.post('/user/token', {
      code: this.code,
      redirect_uri: environment.honeywell.redirectUrl,
      consumerKey: this.consumerKey,
      consumerSecret: this.consumerSecret,
    }).subscribe(
      (response) => {
        this.authData = {
          consumerKey: this.consumerKey,
          consumerSecret: this.consumerSecret,
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
        };
        this.listen();
      },
      (err) => {
        this.authError = true;
      }
    );
  }

  listen() {
    window.addEventListener('message', (event) => {
      if (event.data === 'origin-check') {
        this.parentOrigin = event.origin;
      }
    }, false);
  }

  confirm() {
    window.opener.postMessage(JSON.stringify(this.authData), this.parentOrigin);
  }

}
