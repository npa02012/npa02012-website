import { Injectable } from '@angular/core';
import { ConfigService } from './config.service';
import { HttpClient } from '@angular/common/http';
import { HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class CognitoService {

  private idToken: string;

  constructor(private http: HttpClient) {
    this.idToken = localStorage.getItem('id-token');
  }

  login() {
    window.location.href = `https://${ConfigService.get().cognitoDomain}.auth.${ConfigService.get().region}.amazoncognito.com/login?client_id=${ConfigService.get().cognitoClientId}&response_type=code&scope=openid&redirect_uri=${ConfigService.get().serverUrl}`;
  }
  
  guestLogin() {
    const headers = {
      headers : new HttpHeaders({
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        })
      };
    const data = {
     "AuthParameters" : {
        "USERNAME" : ConfigService.get().guestEmail,
        "PASSWORD" : ConfigService.get().guestPassword,
     },
     "AuthFlow" : "USER_PASSWORD_AUTH",
     "ClientId" : ConfigService.get().cognitoClientId,
    };
    let response = this.http.post('https://cognito-idp.us-east-1.amazonaws.com/', data, headers).subscribe(data => {
      this.idToken = data['AuthenticationResult']['IdToken'];
      localStorage.setItem('id-token', this.idToken);
      window.location.reload();
    });
  }

  retrieveIdToken(code: string): Observable<any> {
    let body = new HttpParams();
    body = body.set('grant_type', 'authorization_code');
    body = body.set('code', code);
    body = body.set('client_id', ConfigService.get().cognitoClientId);
    body = body.set('redirect_uri', ConfigService.get().serverUrl);
    return this.http.post(`https://${ConfigService.get().cognitoDomain}.auth.${ConfigService.get().region}.amazoncognito.com/oauth2/token`, body).pipe(
      tap(
        data => {
          this.idToken = data.id_token;
          localStorage.setItem('id-token', this.idToken);
        }
      )
    )
  }

  logout() {
    localStorage.removeItem('id-token');
    window.location.href = `https://${ConfigService.get().cognitoDomain}.auth.${ConfigService.get().region}.amazoncognito.com/logout?logout_uri=${ConfigService.get().serverUrl}&client_id=${ConfigService.get().cognitoClientId}`;
  }

  getIdToken(): String {
    return this.idToken;
  }

  isLoggedIn() {
    return this.idToken != null
  }
}
